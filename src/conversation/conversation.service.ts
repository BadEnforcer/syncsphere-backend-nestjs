import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PresenceService } from 'src/chat/presence/presence.service';
import { type UserSession } from '@thallesp/nestjs-better-auth';
import { Prisma } from '@prisma/client';
import {
  ConversationDetailsResponse,
  DmConversationDetailsResponse,
  GroupConversationDetailsResponse,
  ConversationListItemResponse,
  GetConversationsResponse,
  MarkAsReadResponse,
} from './conversation.dto';

// Define the exact shape of conversation data included in the query
const conversationWithIncludes =
  Prisma.validator<Prisma.ConversationDefaultArgs>()({
    include: {
      participants: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              lastSeenAt: true,
              invisible: true,
            },
          },
        },
      },
      messages: {
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      },
      group: {
        include: {
          _count: {
            select: {
              members: true,
            },
          },
        },
      },
    },
  });

type ConversationWithIncludes = Prisma.ConversationGetPayload<
  typeof conversationWithIncludes
>;

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
  ) {}

  /**
   * Marks a conversation as read by updating the participant's lastReadAt timestamp.
   * User must be a participant in the conversation.
   */
  async markAsRead(
    conversationId: string,
    session: UserSession,
  ): Promise<MarkAsReadResponse> {
    try {
      const currentUserId = session.user.id;

      // Find the participant record for this user in the conversation
      const participant = await this.prisma.participant.findUnique({
        where: {
          userId_conversationId: {
            userId: currentUserId,
            conversationId,
          },
        },
      });

      // Check if user is a participant
      if (!participant) {
        this.logger.debug(
          `User ${currentUserId} is not a participant of conversation ${conversationId}`,
        );
        throw new NotFoundException('Conversation not found');
      }

      // Update lastReadAt to current timestamp
      const now = new Date();
      await this.prisma.participant.update({
        where: { id: participant.id },
        data: { lastReadAt: now },
      });

      this.logger.debug(
        `User ${currentUserId} marked conversation ${conversationId} as read`,
      );

      return {
        success: true,
        lastReadAt: now,
      };
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw e;
      }
      this.logger.error(
        `Failed to mark conversation ${conversationId} as read`,
      );
      this.logger.error(e);
      throw e;
    }
  }

  /**
   * Retrieves all conversations for a user with pagination.
   * Includes last message (with summary for deleted messages), unread count,
   * and metadata (participant info for DMs, group info for group chats).
   * Excludes conversations with no messages.
   * Sorted by most recent message first.
   */
  async getUserConversations(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<GetConversationsResponse> {
    try {
      this.logger.log(
        `Fetching conversations for user ${userId} with limit=${limit}, offset=${offset}`,
      );

      // Fetch all conversations where user is a participant
      const conversations = await this.prisma.conversation.findMany({
        where: {
          participants: {
            some: {
              userId,
            },
          },
        },
        include: conversationWithIncludes.include,
      });

      // Filter out conversations with no messages
      const conversationsWithMessages = conversations.filter(
        (conv) => conv.messages.length > 0,
      );

      // Sort by most recent message timestamp
      conversationsWithMessages.sort((a, b) => {
        const aTimestamp = a.messages[0]?.timestamp.getTime() || 0;
        const bTimestamp = b.messages[0]?.timestamp.getTime() || 0;
        return bTimestamp - aTimestamp;
      });

      // Apply pagination
      const paginatedConversations = conversationsWithMessages.slice(
        offset,
        offset + limit,
      );

      // Build response with enriched data
      const enrichedConversations = await this._enrichConversations(
        paginatedConversations,
        userId,
      );

      this.logger.log(
        `Fetched ${enrichedConversations.length} conversations for user ${userId}`,
      );

      return {
        conversations: enrichedConversations,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get conversations for user ${userId} due to an error`,
      );
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Retrieves only conversations with unread messages for the user.
   * Uses Raw SQL for efficient filtering.
   */
  async getUnreadUserConversations(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<GetConversationsResponse> {
    try {
      this.logger.log(
        `Fetching unread conversations for user ${userId} with limit=${limit}, offset=${offset}`,
      );

      // Raw SQL to find IDs of conversations with unread messages
      const unreadConversationIds = await this.prisma.$queryRaw<
        Array<{ id: string }>
      >`
        SELECT c.id
        FROM "conversation" c
        JOIN "participant" p ON p."conversationId" = c.id
        JOIN "message" m ON m."conversation_id" = c.id
        WHERE p."userId" = ${userId}
          AND m.timestamp > p.last_read_at
          AND m.sender_id != ${userId}
          AND m.deleted_at IS NULL
        GROUP BY c.id
        ORDER BY MAX(m.timestamp) DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const ids = unreadConversationIds.map((r) => r.id);

      if (ids.length === 0) {
        return { conversations: [] };
      }

      // Fetch full details for these IDs
      const conversations = await this.prisma.conversation.findMany({
        where: {
          id: { in: ids },
        },
        include: conversationWithIncludes.include,
      });

      // Sort conversations to match the order of IDs from the raw query
      const conversationMap = new Map(conversations.map((c) => [c.id, c]));
      const sortedConversations = ids
        .map((id) => conversationMap.get(id))
        .filter((c) => c !== undefined);

      const enrichedConversations = await this._enrichConversations(
        sortedConversations,
        userId,
      );

      return {
        conversations: enrichedConversations,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch unread conversations for user ${userId}`,
      );
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Helper to enrich conversation data with unread counts, last message, and participant info.
   */
  private async _enrichConversations(
    conversations: ConversationWithIncludes[],
    userId: string,
  ): Promise<ConversationListItemResponse[]> {
    return Promise.all(
      conversations.map(async (conv) => {
        const lastMessage = conv.messages[0];
        const currentUserParticipant = conv.participants.find(
          (p) => p.userId === userId,
        );

        // Calculate unread count: messages with timestamp > lastReadAt
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conv.id,
            timestamp: {
              gt: currentUserParticipant?.lastReadAt || new Date(0),
            },
            senderId: {
              not: userId,
            },
            deletedAt: null,
          },
        });

        // Build last message response
        const lastMessageResponse = lastMessage
          ? {
              id: lastMessage.id,
              message: lastMessage.deletedAt
                ? 'This message was deleted'
                : lastMessage.message,
              contentType: lastMessage.contentType,
              timestamp: lastMessage.timestamp,
              sender: {
                id: lastMessage.sender.id,
                name: lastMessage.sender.name,
                image: lastMessage.sender.image,
              },
              isDeleted: !!lastMessage.deletedAt,
            }
          : null;

        // For DMs: get the other participant
        let participantResponse:
          | ConversationListItemResponse['participant']
          | undefined = undefined;
        if (!conv.isGroup) {
          const otherParticipant = conv.participants.find(
            (p) => p.userId !== userId,
          );
          if (otherParticipant) {
            // Get online status from Redis
            const presenceStatus = await this.presenceService.getStatus(
              otherParticipant.userId,
            );
            const effectiveStatus = otherParticipant.user.invisible
              ? 'offline'
              : presenceStatus;

            participantResponse = {
              id: otherParticipant.user.id,
              name: otherParticipant.user.name,
              image: otherParticipant.user.image,
              status: effectiveStatus,
              lastSeenAt: otherParticipant.user.lastSeenAt,
            };
          }
        }

        // For groups: get group info
        let groupResponse: ConversationListItemResponse['group'] | undefined =
          undefined;
        if (conv.isGroup && conv.group) {
          groupResponse = {
            id: conv.group.id,
            name: conv.group.name,
            logo: conv.group.logo,
            description: conv.group.description,
            memberCount: conv.group._count.members,
          };
        }

        return {
          id: conv.id,
          isGroup: conv.isGroup,
          lastMessage: lastMessageResponse,
          unreadCount,
          participant: participantResponse,
          group: groupResponse,
        };
      }),
    );
  }

  /**
   * Retrieves details of a conversation by ID.
   * For group conversations: returns group info and member list with roles.
   * For DM conversations: returns the other participant's details.
   * User must be a participant in the conversation to access it.
   */
  async getConversationDetails(
    conversationId: string,
    session: UserSession,
  ): Promise<ConversationDetailsResponse> {
    try {
      const currentUserId = session.user.id;

      // Fetch conversation with participants and group info
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                },
              },
            },
          },
          group: {
            include: {
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                      image: true,
                    },
                  },
                },
                orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
              },
            },
          },
        },
      });

      // Check if conversation exists
      if (!conversation) {
        this.logger.debug(`Conversation ${conversationId} not found`);
        throw new NotFoundException('Conversation not found');
      }

      // Check if user is a participant
      const isParticipant = conversation.participants.some(
        (p) => p.userId === currentUserId,
      );
      if (!isParticipant) {
        this.logger.debug(
          `User ${currentUserId} is not a participant of conversation ${conversationId}`,
        );
        throw new NotFoundException('Conversation not found');
      }

      // Handle group conversation
      if (conversation.isGroup && conversation.group) {
        const response: GroupConversationDetailsResponse = {
          id: conversation.id,
          type: 'group',
          createdAt: conversation.createdAt,
          group: {
            id: conversation.group.id,
            name: conversation.group.name,
            logo: conversation.group.logo,
            description: conversation.group.description,
          },
          members: conversation.group.members.map((m) => ({
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
            image: m.user.image,
            role: m.role,
            joinedAt: m.createdAt,
          })),
        };

        this.logger.debug(
          `Returned group conversation details for ${conversationId}`,
        );
        return response;
      }

      // Handle DM conversation
      const otherParticipant = conversation.participants.find(
        (p) => p.userId !== currentUserId,
      );

      if (!otherParticipant) {
        this.logger.warn(
          `DM conversation ${conversationId} has no other participant`,
        );
        throw new NotFoundException('Conversation not found');
      }

      const response: DmConversationDetailsResponse = {
        id: conversation.id,
        type: 'dm',
        createdAt: conversation.createdAt,
        otherParticipant: {
          id: otherParticipant.user.id,
          name: otherParticipant.user.name,
          email: otherParticipant.user.email,
          image: otherParticipant.user.image,
        },
      };

      this.logger.debug(
        `Returned DM conversation details for ${conversationId}`,
      );
      return response;
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw e;
      }
      this.logger.error(
        `Failed to get conversation details for ${conversationId}`,
      );
      this.logger.error(e);
      throw e;
    }
  }
}
