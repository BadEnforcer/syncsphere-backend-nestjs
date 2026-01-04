import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PresenceService } from 'src/chat/presence/presence.service';
import type {
  ConversationResponse,
  GetConversationsResponse,
} from './user.dto';

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

      this.logger.error(`Failed to get user status for ${userId} due to an error`);
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
      this.logger.log(`Updating invisibility for user ${userId} to ${invisible}`);

      // Update the invisibility status in the database
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { invisible },
        select: {
          id: true,
          invisible: true,
        },
      });

      this.logger.log(`User ${userId} invisibility updated to ${updatedUser.invisible}`);

      return {
        invisible: updatedUser.invisible,
      };
    } catch (error) {
      this.logger.error(`Failed to update invisibility for user ${userId} due to an error`);
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
            orderBy: {
              timestamp: 'desc',
            },
            take: 1,
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
      const enrichedConversations: ConversationResponse[] = await Promise.all(
        paginatedConversations.map(async (conv) => {
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
                not: userId, // Don't count own messages as unread
              },
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
          let participantResponse: typeof ConversationResponse.prototype.participant = undefined;
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
                status: effectiveStatus as 'online' | 'offline',
                lastSeenAt: otherParticipant.user.lastSeenAt,
              };
            }
          }

          // For groups: get group info
          let groupResponse: typeof ConversationResponse.prototype.group = undefined;
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
}

