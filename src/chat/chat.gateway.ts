import { Inject, Logger, UseGuards } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import * as nestjsBetterAuth from '@thallesp/nestjs-better-auth';
import Redis from 'ioredis';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { REDIS_CLIENT } from 'src/redis/redis.constants';
import {
  CreateMessageSchema,
  IncomingMessageSchema,
  MessageAction,
  TypingEventSchema,
  MarkAsReadEventSchema,
} from './chat.message.dto';
import { Server, Socket } from 'socket.io';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from 'src/auth';
import z from 'zod';
import { PresenceService } from './presence/presence.service';
import { CloudMessagingService } from 'src/firebase/cloud-messaging.service';
import { OnEvent } from '@nestjs/event-emitter';
import {
  GroupCreatedEvent,
  UserJoinedGroupEvent,
  UserLeftGroupEvent,
  GroupDeletedEvent,
  MemberRoleUpdatedEvent,
} from './events/chat.events';
import { v7 } from 'uuid';

@UseGuards(nestjsBetterAuth.AuthGuard)
@WebSocketGateway()
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
    private readonly cloudMessagingService: CloudMessagingService, // injected
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  afterInit(server: Server) {
    this.server = server;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async handleConnection(client: Socket, ...args: any[]) {
    const headers = client.handshake.headers;

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(headers),
    });

    if (!session) {
      client.disconnect();
      return;
    }

    // update last seen in background
    this.logger.debug('Updating user redis presence');
    void this.presenceService.addConnection(session.user.id, client.id);

    await client.join(`user:${session.user.id}`);
    client.broadcast.emit('user_status_change', {
      userId: session.user.id,
      status: 'online',
    });
    this.logger.log(`User connected: ${session.user.id}`);
  }

  async handleDisconnect(client: Socket) {
    const headers = client.handshake.headers;
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(headers),
    });
    if (!session) {
      return;
    }
    this.logger.log(`User disconnected: ${session.user.id}`);

    const isCompletelyOffline = await this.presenceService.removeConnection(
      session.user.id,
      client.id,
    );
    void this.updateLastSeen(session.user.id);

    if (isCompletelyOffline) {
      // Only broadcast offline if no more sessions exist in Redis
      client.broadcast.emit('user_status_change', {
        userId: session.user.id,
        status: 'offline',
      });
    }
  }

  @SubscribeMessage('send_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any,
    @nestjsBetterAuth.Session() session: nestjsBetterAuth.UserSession,
  ) {
    try {
      const parsedMesage = IncomingMessageSchema.safeParse(payload);
      if (!parsedMesage.success) {
        this.logger.error('Failed to parse message payload');
        this.logger.error(parsedMesage.error);
        client.emit('err', {
          message: 'Failed to parse message payload',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: payload,
        });
        return;
      }

      if (session.user.id !== parsedMesage.data.senderId) {
        this.logger.log(
          `User ${session.user.id} attempted to send message as ${parsedMesage.data.senderId} without proper impersonation`,
        );
        client.emit('err', {
          message: 'Please user the senderID of the logged in User',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: payload,
        });
        return;
      }

      // NOTE: if session user does not belong to group, it can still impersonate and send messages
      // This can be dealt with in the future

      const conversationId = parsedMesage.data.conversationId;
      const senderId = parsedMesage.data.senderId;

      // Check if this is a DM conversation (format: userId1_userId2, sorted alphabetically)
      const isDMConversation = this.isDMConversationId(conversationId);

      // Validate DM conversation ID: sender must be one of the two users
      if (isDMConversation) {
        const dmUserIds = conversationId.split('_');
        if (!dmUserIds.includes(senderId)) {
          this.logger.error(
            `Sender ${senderId} is not part of DM conversation ${conversationId}`,
          );
          client.emit('err', {
            message: 'Invalid DM conversation: sender is not a participant',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            data: payload,
          });
          return;
        }
      }

      // Find the conversation, or create it if it's a DM and doesn't exist
      let conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { participants: true },
      });

      // Auto-create DM conversation if it doesn't exist
      if (!conversation && isDMConversation) {
        const [userId1, userId2] = conversationId.split('_');

        // Verify both users exist before creating the conversation
        const usersExist = await this.prisma.user.count({
          where: { id: { in: [userId1, userId2] } },
        });

        if (usersExist !== 2) {
          this.logger.error(
            `One or both users do not exist for DM: ${conversationId}`,
          );
          client.emit('err', {
            message: 'One or both users do not exist',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            data: payload,
          });
          return;
        }

        // Create the DM conversation with both participants
        conversation = await this.prisma.conversation.create({
          data: {
            id: conversationId,
            isGroup: false,
            participants: {
              createMany: {
                data: [
                  { userId: userId1, lastReadAt: new Date(0) },
                  { userId: userId2, lastReadAt: new Date(0) },
                ],
              },
            },
          },
          include: { participants: true },
        });

        this.logger.log(`Created new DM conversation: ${conversationId}`);
      }

      if (!conversation) {
        this.logger.error('Conversation not found');
        client.emit('err', {
          message: 'Conversation not found',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: payload,
        });
        return;
      }

      // if user is not a member of the group
      if (
        !conversation.participants.some(
          (participant) => participant.userId === parsedMesage.data.senderId,
        )
      ) {
        this.logger.error('User is not a member of the group', conversation);
        client.emit('err', {
          message: 'User is not a member of the group',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: payload,
        });
        return;
      }

      // save the message in DB
      // if acton = Update, update it Instead

      const parsedDBMessage = CreateMessageSchema.safeParse(parsedMesage.data); // this wil never fail
      if (!parsedDBMessage.success) {
        this.logger.error('Failed to parse message payload when saving to DB');
        this.logger.error(parsedDBMessage.error);
        client.emit('err', {
          message: 'Failed to parse message payload',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: payload,
        });
        return;
      }

      await this.handleMessageAction(
        parsedMesage.data.action,
        parsedMesage.data,
        parsedDBMessage.data,
      );

      // send to all members
      conversation.participants.forEach((participant) => {
        this.server
          .to(`user:${participant.userId}`)
          .emit('message', parsedMesage.data);
      });

      // Send notification to other participants
      await this.sendNewMessageNotification(
        conversation,
        session.user,
        parsedDBMessage.data,
      );
    } catch (e) {
      this.logger.error('Failed to handle send-message ws event');
      this.logger.error(e);
    }
  }

  /**
   * Handles typing_start event from clients.
   * Validates user is a participant in the conversation and broadcasts to other members.
   */
  @SubscribeMessage('typing_start')
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
    @nestjsBetterAuth.Session() session: nestjsBetterAuth.UserSession,
  ) {
    await this.handleTypingEvent(client, payload, session, true);
  }

  /**
   * Handles typing_stop event from clients.
   * Validates user is a participant in the conversation and broadcasts to other members.
   */
  @SubscribeMessage('typing_stop')
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
    @nestjsBetterAuth.Session() session: nestjsBetterAuth.UserSession,
  ) {
    await this.handleTypingEvent(client, payload, session, false);
  }

  /**
   * Shared logic for typing indicator events.
   * Validates the payload, checks user membership, and broadcasts to participants.
   */
  private async handleTypingEvent(
    client: Socket,
    payload: unknown,
    session: nestjsBetterAuth.UserSession,
    isTyping: boolean,
  ) {
    try {
      // Validate payload structure
      const parsed = TypingEventSchema.safeParse(payload);
      if (!parsed.success) {
        this.logger.error('Failed to parse typing event payload');
        client.emit('err', {
          message: 'Invalid typing event payload',
          data: payload,
        });
        return;
      }

      const { conversationId } = parsed.data;
      const userId = session.user.id;

      // Fetch conversation with participants
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { participants: true },
      });

      // Check if conversation exists
      if (!conversation) {
        client.emit('err', {
          message: 'Conversation not found',
          data: payload,
        });
        return;
      }

      // Check if user is a participant
      const isParticipant = conversation.participants.some(
        (p) => p.userId === userId,
      );
      if (!isParticipant) {
        client.emit('err', {
          message: 'User is not a member of this conversation',
          data: payload,
        });
        return;
      }

      // Broadcast to all OTHER participants in the conversation
      conversation.participants.forEach((participant) => {
        if (participant.userId !== userId) {
          this.server.to(`user:${participant.userId}`).emit('user_typing', {
            conversationId,
            userId,
            isTyping,
          });
        }
      });
    } catch (e) {
      this.logger.error('Failed to handle typing event');
      this.logger.error(e);
    }
  }

  /**
   * Handles mark_as_read event from clients.
   * Updates lastReadAt for the user and broadcasts 'conversation_read' event to other participants.
   */
  @SubscribeMessage('mark_as_read')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
    @nestjsBetterAuth.Session() session: nestjsBetterAuth.UserSession,
  ) {
    try {
      // Validate payload structure
      const parsed = MarkAsReadEventSchema.safeParse(payload);
      if (!parsed.success) {
        this.logger.error('Failed to parse mark_as_read event payload');
        client.emit('err', {
          message: 'Invalid mark_as_read event payload',
          data: payload,
        });
        return;
      }

      const { conversationId } = parsed.data;
      const userId = session.user.id;

      // Try to get participants from cache if it's a group
      // We don't know if it's a group yet, but we can try the cache key pattern
      const cacheKey = `group:${conversationId}:members`;
      const cachedMembers =
        await this.cacheManager.get<{ id: string; role: string }[]>(cacheKey);

      let participants: { userId: string }[] = [];

      if (cachedMembers) {
        // Cache hit! Use cached members
        participants = cachedMembers.map((m) => ({ userId: m.id }));
      } else {
        // Cache miss, fetch from DB
        const conversation = await this.prisma.conversation.findUnique({
          where: { id: conversationId },
          include: { participants: true },
        });

        if (!conversation) {
          client.emit('err', {
            message: 'Conversation not found',
            data: payload,
          });
          return;
        }

        participants = conversation.participants;
      }

      // Check if user is a participant
      const isParticipant = participants.some((p) => p.userId === userId);

      if (!isParticipant) {
        client.emit('err', {
          message: 'User is not a member of this conversation',
          data: payload,
        });
        return;
      }

      // Update lastReadAt timestamp
      // We need the participant ID for the update. If we used cache, we might not have it.
      // So we do a targeted update using the compound key userId_conversationId
      const now = new Date();
      await this.prisma.participant.update({
        where: {
          userId_conversationId: {
            userId,
            conversationId,
          },
        },
        data: { lastReadAt: now },
      });

      this.logger.debug(
        `User ${userId} marked conversation ${conversationId} as read`,
      );

      // Broadcast to all OTHER participants in the conversation
      participants.forEach((p) => {
        if (p.userId !== userId) {
          this.server.to(`user:${p.userId}`).emit('conversation_read', {
            conversationId,
            userId,
            readAt: now.toISOString(),
          });
        }
      });
    } catch (e) {
      this.logger.error('Failed to handle mark_as_read event');
      this.logger.error(e);
    }
  }

  /**
   * Handles message persistence based on the action type (INSERT, UPDATE, DELETE).
   * Uses upsert for INSERT to handle duplicate messages gracefully.
   */
  private async handleMessageAction(
    action: MessageAction,
    incomingMessage: z.infer<typeof IncomingMessageSchema>,
    dbMessage: z.infer<typeof CreateMessageSchema>,
  ) {
    // Convert content/metadata to Prisma-compatible Json types
    // Cast is needed because Zod's looseObject includes index signature that Prisma doesn't accept
    const content = dbMessage.content
      ? (dbMessage.content as Prisma.InputJsonValue)
      : Prisma.JsonNull;
    const metadata = dbMessage.metadata
      ? (dbMessage.metadata as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    const prismaData = {
      ...dbMessage,
      content,
      metadata,
    };

    if (action === MessageAction.INSERT) {
      // Use upsert to handle duplicates gracefully (idempotent)
      await this.prisma.message.upsert({
        where: {
          id: incomingMessage.id,
        },
        create: prismaData,
        update: {}, // No update on duplicate - keep existing message
      });
    } else if (action === MessageAction.UPDATE) {
      await this.prisma.message.update({
        where: {
          id: incomingMessage.id,
        },
        data: {
          content,
          metadata,
          message: dbMessage.message,
          action: MessageAction.UPDATE,
        },
      });
    } else if (action === MessageAction.DELETE) {
      // Soft delete by setting deletedAt timestamp
      const deletedMessage = await this.prisma.message.update({
        where: {
          id: incomingMessage.id,
        },
        data: {
          deletedAt: new Date(),
          action: MessageAction.DELETE,
        },
        include: { conversation: { include: { participants: true } } },
      });

      // Send silent notification to remove message
      await this.sendDeletedMessageNotification(
        deletedMessage.conversation,
        deletedMessage.senderId,
        incomingMessage.id,
      );
    }
  }

  private async updateLastSeen(userId: string) {
    try {
      await this.prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          lastSeenAt: new Date(),
        },
      });
    } catch (e) {
      this.logger.error(`Failed to update last seen for user ${userId}`);
      this.logger.error(e);
    }
  }

  /**
   * Checks if a conversation ID follows the DM format: userId1_userId2
   * where userId1 < userId2 (alphabetically sorted).
   * Returns true if the ID contains exactly one underscore and the parts are in sorted order.
   */
  private isDMConversationId(conversationId: string): boolean {
    const parts = conversationId.split('_');

    // Must have exactly 2 parts (two user IDs)
    if (parts.length !== 2) {
      return false;
    }

    const [userId1, userId2] = parts;

    // Both parts must be non-empty and sorted alphabetically
    return userId1.length > 0 && userId2.length > 0 && userId1 < userId2;
  }

  private async getRecipientTokens(recipientIds: string[]): Promise<string[]> {
    if (recipientIds.length === 0) return [];

    const sessions = await this.prisma.session.findMany({
      where: {
        userId: { in: recipientIds },
        fcmToken: { not: null },
      },
      select: { fcmToken: true },
    });

    return sessions
      .map((s) => s.fcmToken) // type cast due to eslint error
      .filter((t): t is string => !!t && t.length > 0);
  }

  private async sendNewMessageNotification(
    conversation: Prisma.ConversationGetPayload<{
      include: { participants: true };
    }>,
    sender: { id: string; name: string | null },
    message: z.infer<typeof CreateMessageSchema>,
  ) {
    const recipientIds = conversation.participants
      .filter((p) => p.userId !== sender.id)
      .map((p) => p.userId);

    const tokens = await this.getRecipientTokens(recipientIds);
    if (tokens.length === 0) return;

    const title = sender.name ?? 'New Message';
    const body =
      message.contentType === 'TEXT'
        ? message.message || 'Sent a message'
        : `Sent a ${message.contentType.toLowerCase()}`;

    await this.cloudMessagingService.sendNotification(
      tokens,
      { title, body },
      {
        type: 'NEW_MESSAGE',
        conversationId: message.conversationId,
        messageId: message.id,
      },
    );
  }

  private async sendDeletedMessageNotification(
    conversation: Prisma.ConversationGetPayload<{
      include: { participants: true };
    }>,
    senderId: string,
    messageId: string,
  ) {
    const recipientIds = conversation.participants
      .filter((p) => p.userId !== senderId)
      .map((p) => p.userId);

    const tokens = await this.getRecipientTokens(recipientIds);
    if (tokens.length === 0) return;

    await this.cloudMessagingService.sendSilentNotification(tokens, {
      type: 'MESSAGE_DELETED',
      messageId,
      conversationId: conversation.id,
    });
  }

  /**
   * Helper to create and send a system message to a conversation.
   * Persists the message to the database and emits it to all participants via WebSocket.
   */
  private async sendSystemMessage(
    conversationId: string,
    text: string,
    metadata?: Record<string, any>,
  ) {
    try {
      // 1. Create the system message in DB
      const messageId = v7();
      const timestamp = new Date();
      // const systemSenderId = 'system'; // We'll use a reserved ID for system messages

      const messageData: Prisma.MessageCreateInput = {
        id: messageId,
        timestamp,
        contentType: 'SYSTEM',
        content: {
          contentType: 'SYSTEM',
          code: 'info', // generic info code
          text,
        },
        metadata: metadata ?? Prisma.JsonNull,
        message: text,
        action: MessageAction.INSERT,
        conversation: { connect: { id: conversationId } },
        sender: {
          // connectOrCreate: {
          //   where: { id: systemSenderId },
          //   create: {
          //     id: systemSenderId,
          //     name: 'System',
          //     email: 'system@syncsphere.com',
          //     // Add other required fields with defaults if necessary, though User model usually has defaults
          //   },
          // },
        },
      };

      const createdMessage = await this.prisma.message.create({
        data: messageData,
        include: { conversation: { include: { participants: true } } },
      });

      // 2. Broadcast to all participants
      createdMessage.conversation.participants.forEach((participant) => {
        this.server.to(`user:${participant.userId}`).emit('message', {
          ...createdMessage,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          content: createdMessage.content as any, // Cast for partial match
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          metadata: createdMessage.metadata as any,
        });
      });

      // 3. Send Push Notification (Optional for system messages? Maybe silently?)
      // For now, let's skip push notifs for system messages to avoid spam,
      // or we can add it later if requested.
    } catch (e) {
      this.logger.error(
        `Failed to send system message to conversation ${conversationId}`,
      );
      this.logger.error(e);
    }
  }

  @OnEvent('group.created')
  async handleGroupCreated(payload: GroupCreatedEvent) {
    this.logger.log(`Handling group.created event for ${payload.groupId}`);
    await this.sendSystemMessage(
      payload.conversationId,
      `Group created by ${payload.name}`,
      { type: 'group_created', creatorId: payload.creatorId },
    );
  }

  @OnEvent('group.user.joined')
  async handleUserJoinedGroup(payload: UserJoinedGroupEvent) {
    this.logger.log(
      `Handling group.user.joined event for user ${payload.userId} in group ${payload.groupId}`,
    );
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
        select: { name: true },
      });
      const userName = user?.name || 'Unknown User';

      const addedByUser = await this.prisma.user.findUnique({
        where: { id: payload.addedByUserId },
        select: { name: true },
      });
      const addedByUserName = addedByUser?.name || 'Unknown User';

      const text =
        payload.userId === payload.addedByUserId
          ? `${userName} joined the group`
          : `${addedByUserName} added ${userName}`;

      await this.sendSystemMessage(payload.conversationId, text, {
        type: 'user_joined',
        userId: payload.userId,
        addedByUserId: payload.addedByUserId,
      });
    } catch (e) {
      this.logger.error('Error handling user joined event', e);
    }
  }

  @OnEvent('group.user.left')
  async handleUserLeftGroup(payload: UserLeftGroupEvent) {
    this.logger.log(
      `Handling group.user.left event for user ${payload.userId} in group ${payload.groupId}`,
    );
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
        select: { name: true },
      });
      const userName = user?.name || 'Unknown User';

      let text = `${userName} left the group`;

      if (
        payload.removedByUserId &&
        payload.removedByUserId !== payload.userId
      ) {
        const removedByUser = await this.prisma.user.findUnique({
          where: { id: payload.removedByUserId },
          select: { name: true },
        });
        const removedByUserName = removedByUser?.name || 'Admin';
        text = `${removedByUserName} removed ${userName}`;
      }

      await this.sendSystemMessage(payload.conversationId, text, {
        type: 'user_left',
        userId: payload.userId,
        removedByUserId: payload.removedByUserId,
      });
    } catch (e) {
      this.logger.error('Error handling user left event', e);
    }
  }

  @OnEvent('group.member.updated')
  async handleMemberUpdated(payload: MemberRoleUpdatedEvent) {
    this.logger.log(
      `Handling group.member.updated event for user ${payload.userId} in group ${payload.groupId}`,
    );
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
        select: { name: true },
      });
      const userName = user?.name || 'Unknown User';

      let text = '';
      if (payload.newRole === 'ADMIN') {
        text = `${userName} is now an Admin`;
      } else {
        text = `${userName} is no longer an Admin`;
      }

      await this.sendSystemMessage(payload.conversationId, text, {
        type: 'member_updated',
        userId: payload.userId,
        role: payload.newRole,
      });
    } catch (e) {
      this.logger.error('Error handling member updated event', e);
    }
  }

  @OnEvent('group.deleted')
  // eslint-disable-next-line @typescript-eslint/require-await
  async handleGroupDeleted(payload: GroupDeletedEvent) {
    this.logger.log(
      `Handling group.deleted event for group ${payload.groupId}`,
    );
    // Since the group and conversation are deleted (cascade), we might not be able to send a message to it.
    // Instead, we should notify connected clients that the conversation is gone so they can remove it from UI.

    // We can't query participants since they might be gone.
    // Ideally, we should have fetched them before deletion or the event payload should contain them.
    // However, if we follow the current GroupService implementation, it deletes the group which cascades.
    // So we can assume the data is gone.
    // Best effort: The clients might receive an error next time they try to fetch it.
    // Or we could try to broadcast to a room if we had 'group:groupId' rooms.
    // Current implementation joins `user:userId`.

    // For now, let's log it. Real-time handling of deletion requires fetching members before deletion in the service
    // and passing them in the event.
    this.logger.warn(
      `Group ${payload.groupId} deleted. Real-time notification not fully implemented without member list.`,
    );
  }
}
