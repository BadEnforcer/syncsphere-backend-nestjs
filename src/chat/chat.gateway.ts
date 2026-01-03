import { Inject, Logger, UseGuards } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayInit, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import * as nestjsBetterAuth from '@thallesp/nestjs-better-auth';
import Redis from 'ioredis';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { REDIS_CLIENT } from 'src/redis/redis.constants';
import { CreateMessageSchema, IncomingMessageSchema, MessageAction } from './chat.message.dto';
import { Server, Socket } from 'socket.io';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from 'src/auth';
import z from 'zod';

@UseGuards(nestjsBetterAuth.AuthGuard)
@WebSocketGateway()
export class ChatGateway implements OnGatewayConnection, OnGatewayInit  {

  private server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis, 
  ) { }

  afterInit(server: Server) {
    this.server = server;
  }
  

  async handleConnection(client: Socket, ...args: any[]) {

    const headers = client.handshake.headers;

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(headers),
    })

    if (!session) {
      client.disconnect();
      return;
    }

    client.join(`user:${session.user.id}`);
    this.logger.log(`User connected: ${session.user.id}`);



  }

  @SubscribeMessage('send-message')
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
        client.emitWithAck('err', { message: 'Failed to parse message payload', data: payload });
        return;
      }

      if (session.user.id !== parsedMesage.data.senderId) {
        this.logger.log(`User ${session.user.id} attempted to send message as ${parsedMesage.data.senderId} without proper impersonation`);
        client.emitWithAck('err', { message: 'Please user the senderID of the logged in User', data: payload });
        return;
      }

      // NOTE: if session user does not belong to group, it can still impersonate and send messages
      // This can be dealt with in the future

      // find the conversation
      // Session user is fetched, just to make sure user is Valid.
      const [conversation, senderGroupMembership] = await Promise.all([
        this.prisma.conversation.findUnique({
        where: {
          id: parsedMesage.data.conversationId,
        },
        include: {
          participants: true
        },
        }),
        this.prisma.groupMember.findFirst({
          where: {
            groupId: parsedMesage.data.conversationId,
            userId: parsedMesage.data.senderId,
          }
        }),
      ])

      if (!conversation) {
        this.logger.error('Conversation not found');
        client.emitWithAck('err', { message: 'Conversation not found', data: payload });
        return;
      }

      // if user is not a member of the group
      if (!senderGroupMembership) {
        this.logger.error('User is not a member of the group');
        client.emitWithAck('err', { message: 'User is not a member of the group', data: payload });
        return;
      }

      // save the message in DB
      // if acton = Update, update it Instead

      const parsedDBMessage = CreateMessageSchema.safeParse(parsedMesage.data); // this wil never fail
      if (!parsedDBMessage.success) {
        this.logger.error('Failed to parse message payload when saving to DB');
        this.logger.error(parsedDBMessage.error);
        client.emitWithAck('err', { message: 'Failed to parse message payload', data: payload });
        return;
      }

      await this.handleMessageAction(parsedMesage.data.action, parsedMesage.data, parsedDBMessage.data);


      // send to all members
      conversation.participants.forEach(participant => {
          this.server.to(`user:${participant.userId}`).emit('message', parsedMesage.data);
        });

      // TODO: in future, send notifications too


    } catch (e) {
      this.logger.error('Failed to handle send-message ws event')
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
}

