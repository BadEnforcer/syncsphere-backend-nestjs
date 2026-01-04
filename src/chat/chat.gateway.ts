import { Inject, Logger, UseGuards } from '@nestjs/common';
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
} from './chat.message.dto';
import { Server, Socket } from 'socket.io';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from 'src/auth';
import z from 'zod';
import { PresenceService } from './presence/presence.service';

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
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
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
                data: [{ userId: userId1 }, { userId: userId2 }],
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

      // TODO: in future, send notifications too
    } catch (e) {
      this.logger.error('Failed to handle send-message ws event');
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
      await this.prisma.message.update({
        where: {
          id: incomingMessage.id,
        },
        data: {
          deletedAt: new Date(),
          action: MessageAction.DELETE,
        },
      });
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
}
