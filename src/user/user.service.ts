import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PresenceService } from 'src/chat/presence/presence.service';
import { ConversationResponse, GetConversationsResponse } from './user.dto';
import { Prisma } from '@prisma/client';

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
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
  ) {}

  /**
   * Retrieves a user's presence status, last seen timestamp, and invisible flag.
   * If the user has invisible mode enabled, status is returned as 'offline' regardless
   * of actual presence in Redis.
   *
   * @throws NotFoundException if user is not found
   */
  async getUserStatus(userId: string) {
    try {
      this.logger.log(`Fetching status for user ${userId}`);

      // Fetch user from database
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          lastSeenAt: true,
          invisible: true,
        },
      });

      if (!user) {
        this.logger.warn(`User ${userId} not found`);
        throw new NotFoundException('User not found');
      }

      // Get real-time presence status from Redis
      const presenceStatus = await this.presenceService.getStatus(userId);

      // If user is invisible, always return 'offline'
      const effectiveStatus = user.invisible ? 'offline' : presenceStatus;

      this.logger.log(
        `User ${userId} status: ${effectiveStatus}, invisible: ${user.invisible}`,
      );

      return {
        status: effectiveStatus,
        lastSeenAt: user.lastSeenAt,
        invisible: user.invisible ?? false,
      };
    } catch (error) {
      // Re-throw NotFoundException as-is
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Failed to get user status for ${userId} due to an error`,
      );
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Updates the user's invisibility status.
   * When invisible is true, the user will appear offline to others.
   */
  async updateInvisibility(userId: string, invisible: boolean) {
    try {
      this.logger.log(
        `Updating invisibility for user ${userId} to ${invisible}`,
      );

      // Update the invisibility status in the database
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { invisible },
        select: {
          id: true,
          invisible: true,
        },
      });

      this.logger.log(
        `User ${userId} invisibility updated to ${updatedUser.invisible}`,
      );

      return {
        invisible: updatedUser.invisible,
      };
    } catch (error) {
      this.logger.error(
        `Failed to update invisibility for user ${userId} due to an error`,
      );
      this.logger.error(error);
      throw error;
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
      // We join message and participant to compare timestamp vs lastReadAt
      // Tables are mapped to lowercase names in schema
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
  ): Promise<ConversationResponse[]> {
    return Promise.all(
      conversations.map(async (conv) => {
        const lastMessage = conv.messages[0];
        const currentUserParticipant = conv.participants.find(
          (p) => p.userId === userId,
        );

        // Calculate unread count: messages with timestamp > lastReadAt
        // Excludes deleted messages and own messages
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conv.id,
            timestamp: {
              gt: currentUserParticipant?.lastReadAt || new Date(0),
            },
            senderId: {
              not: userId, // Don't count own messages as unread
            },
            deletedAt: null, // Don't count deleted messages as unread
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
        let participantResponse: typeof ConversationResponse.prototype.participant =
          undefined;
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
        let groupResponse: typeof ConversationResponse.prototype.group =
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
   * Retrieves all organization members with pagination and optional fuzzy search.
   * Excludes banned users. Returns basic member info (id, name, email, image, createdAt).
   * Fuzzy search matches against name, email, or id (case-insensitive).
   */
  async getAllMembers(limit: number = 20, offset: number = 0, search?: string) {
    try {
      this.logger.log(
        `Fetching members with limit=${limit}, offset=${offset}, search=${search ?? 'none'}`,
      );

      // Build the where clause with banned users excluded
      const whereClause = {
        banned: { not: true },
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { id: { contains: search, mode: 'insensitive' as const } },
          ],
        }),
      };

      // Execute count and find in parallel for efficiency
      const [total, members] = await Promise.all([
        this.prisma.user.count({ where: whereClause }),
        this.prisma.user.findMany({
          where: whereClause,
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
          },
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      const hasMore = offset + members.length < total;

      this.logger.log(`Fetched ${members.length} members (total: ${total})`);

      return {
        data: members,
        total,
        hasMore,
      };
    } catch (error) {
      this.logger.error('Failed to fetch members due to an error');
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Fetches all non-banned users with their online/offline status.
   * Uses parallel fetching via PresenceService.getBulkStatus() for efficiency.
   * Respects user invisibility - invisible users are shown as 'offline'.
   */
  async getAllUsersStatus() {
    try {
      this.logger.log('Fetching all users status');

      // Fetch all non-banned users
      const users = await this.prisma.user.findMany({
        where: { banned: { not: true } },
        select: {
          id: true,
          name: true,
          image: true,
          invisible: true,
        },
        orderBy: { name: 'asc' },
      });

      // Get user IDs for bulk status lookup
      const userIds = users.map((u) => u.id);

      // Fetch all statuses in parallel
      const statusMap = await this.presenceService.getBulkStatus(userIds);

      // Build response with effective status (respecting invisibility)
      const usersWithStatus = users.map((user) => {
        const presenceStatus = statusMap.get(user.id) ?? 'offline';
        // If user is invisible, always show as offline
        const effectiveStatus = user.invisible ? 'offline' : presenceStatus;

        return {
          id: user.id,
          name: user.name,
          image: user.image,
          status: effectiveStatus,
        };
      });

      this.logger.log(`Fetched status for ${usersWithStatus.length} users`);

      return {
        data: usersWithStatus,
      };
    } catch (error) {
      this.logger.error('Failed to fetch all users status due to an error');
      this.logger.error(error);
      throw error;
    }
  }
}
