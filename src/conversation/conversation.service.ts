import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { type UserSession } from '@thallesp/nestjs-better-auth';
import {
  ConversationDetailsResponse,
  DmConversationDetailsResponse,
  GroupConversationDetailsResponse,
} from './conversation.dto';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(private readonly prisma: PrismaService) {}

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
                orderBy: [
                  { role: 'asc' }, // ADMINs first
                  { createdAt: 'asc' },
                ],
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
        // Edge case: conversation with only one participant (shouldn't happen)
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
      // Re-throw NotFoundException without logging as error
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
