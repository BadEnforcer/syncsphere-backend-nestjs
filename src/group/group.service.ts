import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import * as GroupDto from './group.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { v7 } from 'uuid';
import { type UserSession } from '@thallesp/nestjs-better-auth';
import { GROUP_MEMBERSHIP } from '@prisma/client';

import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  GroupCreatedEvent,
  UserJoinedGroupEvent,
  UserLeftGroupEvent,
  GroupDeletedEvent,
  MemberRoleUpdatedEvent,
} from 'src/chat/events/chat.events';

// Cache TTL for group members: 5 minutes
const GROUP_MEMBERS_CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Generates the cache key for group members.
   */
  private getGroupMembersCacheKey(groupId: string): string {
    return `group:${groupId}:members`;
  }

  /**
   * Invalidates the cached group members for a given group.
   */
  private async invalidateGroupMembersCache(groupId: string): Promise<void> {
    try {
      await this.cacheManager.del(this.getGroupMembersCacheKey(groupId));
      this.logger.debug(`Invalidated members cache for group ${groupId}`);
    } catch (e) {
      this.logger.error(
        `Failed to invalidate members cache for group ${groupId}`,
      );
      this.logger.error(e);
    }
  }

  /**
   * Retrieves all members of a group with user details.
   * Results are cached for 5 minutes. Requires user to be a member of the group.
   */
  async getGroupMembers(
    groupId: string,
    session: UserSession,
  ): Promise<GroupDto.GetGroupMembersResponse> {
    try {
      const currentUserId = session.user.id;
      const cacheKey = this.getGroupMembersCacheKey(groupId);

      // Check cache first
      const cachedMembers =
        await this.cacheManager.get<GroupDto.GetGroupMembersResponse>(cacheKey);
      if (cachedMembers) {
        this.logger.debug(`Cache hit for group members: ${groupId}`);
        return cachedMembers;
      }

      // Fetch from database
      const group = await this.prisma.group.findUnique({
        where: { id: groupId },
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
      });

      if (!group) {
        throw new BadRequestException('Group not found');
      }

      // Verify user is a member of the group
      const isUserMember = group.members.some(
        (m) => m.userId === currentUserId,
      );
      if (!isUserMember) {
        throw new BadRequestException('Group not found');
      }

      // Transform to response format
      const response: GroupDto.GetGroupMembersResponse = {
        members: group.members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          image: m.user.image,
          role: m.role,
          joinedAt: m.createdAt,
        })),
      };

      // Cache the result
      await this.cacheManager.set(
        cacheKey,
        response,
        GROUP_MEMBERS_CACHE_TTL_MS,
      );
      this.logger.debug(`Cached members for group ${groupId}`);

      return response;
    } catch (e) {
      this.logger.error(`Failed to get group members for ${groupId}`);
      this.logger.error(e);
      throw e;
    }
  }

  /**
   * Creates a new group with an associated conversation.
   * The creator is added as an admin, and initial members are added as regular members.
   * A conversation is created and all members are added as participants.
   */
  async createGroup(input: GroupDto.CreateGroupInput, session: UserSession) {
    try {
      this.logger.log('Creating group with data: ', input);
      // TODO: make sure user is not blocked/banned

      const conversationId = v7();
      const result = await this.prisma.$transaction(async (tx) => {
        const groupId = v7();
        const creatorId = session.user.id;

        // Create the group
        const newGroup = await tx.group.create({
          data: {
            id: groupId,
            name: input.name,
            logo: input.logo,
            description: input.description,
          },
        });

        // Add the current user as an admin
        await tx.groupMember.create({
          data: {
            id: v7(),
            groupId: groupId,
            userId: creatorId,
            role: GROUP_MEMBERSHIP.ADMIN,
          },
        });

        // Collect all member user IDs (creator + initial members)
        const allMemberIds = [creatorId];

        if (input.initialMembers && input.initialMembers.length > 0) {
          // Add initial members to the group
          await tx.groupMember.createMany({
            data: input.initialMembers.map((member) => ({
              id: v7(),
              groupId: groupId,
              userId: member.userId,
              role: member.role,
            })),
          });

          // Add initial member IDs to the list
          allMemberIds.push(...input.initialMembers.map((m) => m.userId));
        }

        // Create conversation linked to this group
        await tx.conversation.create({
          data: {
            id: conversationId,
            name: input.name,
            isGroup: true,
            groupId: groupId,
          },
        });

        // Add all members as participants (including the creator)
        await tx.participant.createMany({
          data: allMemberIds.map((userId) => ({
            id: v7(),
            userId: userId,
            conversationId: conversationId,
            lastReadAt: new Date(0),
          })),
        });

        this.logger.log(
          `Created group ${groupId} with conversation ${conversationId} and ${allMemberIds.length} participants`,
        );

        return {
          group: newGroup,
        };
      });

      void this.eventEmitter.emitAsync(
        'group.created',
        new GroupCreatedEvent(
          result.group.id,
          conversationId,
          session.user.id,
          result.group.name,
        ),
      );

      return result;
    } catch (err) {
      this.logger.error('Failed to create group due to an error');
      this.logger.error(err);
      throw err;
    }
  }

  /**
   * Adds new members to a group and syncs them as participants in the conversation.
   * Only admins can add members to the group.
   */
  async addMembers(
    groupId: string,
    input: GroupDto.AddMembersToGroupInput,
    session: UserSession,
  ) {
    try {
      const currentUserId = session.user.id;
      // TODO: also check if all users are members of the organization
      const result = await this.prisma.$transaction(async (tx) => {
        // Fetch group with conversation and relevant members
        const [group, verifiedUsers] = await Promise.all([
          tx.group.findUnique({
            where: {
              id: groupId,
            },
            include: {
              members: {
                where: {
                  userId: {
                    in: [...input, currentUserId], // find existing members + current user's membership
                  },
                },
              },
              conversation: true,
            },
          }),
          tx.user.findMany({
            where: {
              id: {
                in: [...input, currentUserId],
              },
            },
            select: {
              id: true,
            },
          }),
        ]);

        if (!group) {
          this.logger.log('Group not found');
          throw new BadRequestException('Group not found');
        }

        this.logger.log(`Found ${group.members.length} members`);

        // Make sure the user has sufficient permissions and roles in the group
        const currentUserGroupMembership = group.members.find(
          (m) => m.userId === currentUserId,
        );

        if (!currentUserGroupMembership) {
          this.logger.warn(
            `User ${currentUserId} is not a member of group ${groupId}`,
          );
          throw new BadRequestException('Group not found');
        }

        if (currentUserGroupMembership.role !== GROUP_MEMBERSHIP.ADMIN) {
          this.logger.debug(
            `The user ${currentUserId} does not have permission to group ${groupId}`,
          );
          throw new ForbiddenException('Insufficient permissions');
        }

        // Filter to only verified users that aren't already members
        const existingMemberIds = group.members.map((m) => m.userId);
        const verifiedUserIds = verifiedUsers.map((m) => m.id);
        const newUserIds = verifiedUserIds.filter(
          (id) => id !== currentUserId && !existingMemberIds.includes(id),
        );

        if (newUserIds.length === 0) {
          this.logger.log('No new members to add');
          return { memberships: [] };
        }

        // Create group memberships
        const memberships = await tx.groupMember.createManyAndReturn({
          data: newUserIds.map((member) => ({
            id: v7(),
            userId: member,
            groupId: groupId,
            role: GROUP_MEMBERSHIP.MEMBER,
          })),
        });

        // Add participants to conversation if it exists
        if (group.conversation) {
          await tx.participant.createMany({
            data: newUserIds.map((userId) => ({
              id: v7(),
              userId: userId,
              conversationId: group.conversation!.id,
              lastReadAt: new Date(0),
            })),
          });

          this.logger.log(
            `Added ${newUserIds.length} participants to conversation ${group.conversation.id}`,
          );
        }

        return {
          memberships: memberships,
          conversationId: group.conversation?.id,
        };
      });

      // Invalidate cache after successful transaction
      await this.invalidateGroupMembersCache(groupId);

      // Emit events
      if (result.memberships && result.conversationId) {
        result.memberships.forEach((m) => {
          void this.eventEmitter.emitAsync(
            'group.user.joined',
            new UserJoinedGroupEvent(
              groupId,
              result.conversationId!,
              m.userId,
              currentUserId,
            ),
          );
        });
      }

      return { memberships: result.memberships };
    } catch (e) {
      this.logger.error('Failed to add members to group due to an error');
      this.logger.error(e);
      throw e;
    }
  }

  /**
   * Removes a member from a group and the associated conversation.
   * Admins can remove any member, or a user can remove themselves.
   * The last admin cannot remove themselves - they must assign another admin first.
   */
  async removeMember(groupId: string, userId: string, session: UserSession) {
    try {
      const currentUserId = session.user.id;

      const result = await this.prisma.$transaction(async (tx) => {
        // Fetch group with conversation, relevant memberships, and all admins
        const group = await tx.group.findUnique({
          where: {
            id: groupId,
          },
          include: {
            members: true, // Fetch all members to count admins
            conversation: true,
          },
        });

        if (!group) {
          this.logger.log('Group not found');
          throw new BadRequestException('Group not found');
        }

        const currentUserMembership = group.members.find(
          (m) => m.userId === currentUserId,
        );

        // Ensure current user is actually in the group
        if (!currentUserMembership) {
          this.logger.warn(
            `User ${currentUserId} is not a member of group ${groupId}`,
          );
          throw new BadRequestException('Group not found');
        }

        const memberToRemove = group.members.find((m) => m.userId === userId);

        // Ensure target user is in the group
        if (!memberToRemove) {
          this.logger.warn(
            `User ${userId} is not a member of group ${groupId}`,
          );
          throw new BadRequestException('Member not found');
        }

        // Authorization: Allow removal if user is admin OR if user is removing themselves
        if (
          currentUserMembership.role !== GROUP_MEMBERSHIP.ADMIN &&
          userId !== currentUserId
        ) {
          this.logger.debug(
            `The user ${currentUserId} does not have permission to remove members from group ${groupId}`,
          );
          throw new ForbiddenException('Insufficient permissions');
        }

        // Prevent the last admin from removing themselves
        if (
          userId === currentUserId &&
          memberToRemove.role === GROUP_MEMBERSHIP.ADMIN
        ) {
          const adminCount = group.members.filter(
            (m) => m.role === GROUP_MEMBERSHIP.ADMIN,
          ).length;

          if (adminCount === 1) {
            this.logger.debug(
              `User ${currentUserId} is the last admin and cannot remove themselves from group ${groupId}`,
            );
            throw new BadRequestException(
              'Cannot leave group as the last admin. Please assign another admin first.',
            );
          }
        }

        // Delete group membership
        await tx.groupMember.delete({
          where: {
            id: memberToRemove.id,
          },
        });

        // Remove participant from conversation if it exists
        if (group.conversation) {
          await tx.participant.deleteMany({
            where: {
              userId: userId,
              conversationId: group.conversation.id,
            },
          });

          this.logger.log(
            `Removed participant ${userId} from conversation ${group.conversation.id}`,
          );
        }

        return {
          success: true,
          conversationId: group.conversation?.id,
        };
      });

      // Invalidate cache after successful transaction
      await this.invalidateGroupMembersCache(groupId);

      // Emit event
      if (result.conversationId) {
        const removedBy = userId === currentUserId ? null : currentUserId;
        void this.eventEmitter.emitAsync(
          'group.user.left',
          new UserLeftGroupEvent(
            groupId,
            result.conversationId,
            userId,
            removedBy,
          ),
        );
      }

      return { success: result.success };
    } catch (e) {
      this.logger.error('Failed to remove member from group due to an error');
      this.logger.error(e);
      throw e;
    }
  }

  /**
   * Promotes a group member to admin role.
   * Only existing admins can promote other members.
   * A user cannot promote themselves.
   * This operation is idempotent - if the user is already an admin, it succeeds silently.
   */
  async promoteToAdmin(
    groupId: string,
    input: GroupDto.PromoteMemberInput,
    session: UserSession,
  ) {
    try {
      const currentUserId = session.user.id;
      const targetUserId = input.userId;

      const result = await this.prisma.$transaction(async (tx) => {
        // Fetch group with relevant memberships

        const group = await tx.group.findUnique({
          where: {
            id: groupId,
          },
          include: {
            members: {
              where: {
                userId: {
                  in: [currentUserId, targetUserId],
                },
              },
            },
            conversation: true,
          },
        });

        if (!group) {
          this.logger.log('Group not found');
          throw new BadRequestException('Group not found');
        }

        // Verify current user is a member and has admin privileges
        const currentUserMembership = group.members.find(
          (m) => m.userId === currentUserId,
        );

        if (!currentUserMembership) {
          this.logger.warn(
            `User ${currentUserId} is not a member of group ${groupId}`,
          );
          throw new BadRequestException('Group not found');
        }

        if (currentUserMembership.role !== GROUP_MEMBERSHIP.ADMIN) {
          this.logger.debug(
            `User ${currentUserId} does not have permission to promote members in group ${groupId}`,
          );
          throw new ForbiddenException('Insufficient permissions');
        }

        // Prevent self-promotion
        if (targetUserId === currentUserId) {
          this.logger.debug(
            `User ${currentUserId} attempted to promote themselves in group ${groupId}`,
          );
          throw new BadRequestException('Cannot promote yourself');
        }

        // Verify target user is a member of the group
        const targetMembership = group.members.find(
          (m) => m.userId === targetUserId,
        );

        if (!targetMembership) {
          this.logger.warn(
            `Target user ${targetUserId} is not a member of group ${groupId}`,
          );
          throw new BadRequestException('Member not found');
        }

        // Idempotent: if already admin, return success
        if (targetMembership.role === GROUP_MEMBERSHIP.ADMIN) {
          this.logger.log(
            `User ${targetUserId} is already an admin of group ${groupId}`,
          );
          return {
            success: true,
            alreadyAdmin: true,
          };
        }

        // Update the member's role to admin
        await tx.groupMember.update({
          where: {
            id: targetMembership.id,
          },
          data: {
            role: GROUP_MEMBERSHIP.ADMIN,
          },
        });

        this.logger.log(
          `User ${targetUserId} promoted to admin in group ${groupId} by ${currentUserId}`,
        );

        return {
          success: true,
          alreadyAdmin: false,
          conversationId: group.conversation?.id,
        };
      });

      if (result.success && !result.alreadyAdmin && result.conversationId) {
        void this.eventEmitter.emitAsync(
          'group.member.updated',
          new MemberRoleUpdatedEvent(
            groupId,
            result.conversationId,
            targetUserId,
            GROUP_MEMBERSHIP.ADMIN,
            currentUserId,
          ),
        );
      }

      return { success: result.success, alreadyAdmin: result.alreadyAdmin };
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  /**
   * Demotes an admin to regular member role.
   * Only existing admins can demote other admins.
   * A user cannot demote themselves.
   * This operation is idempotent - if the user is already a member, it succeeds silently.
   */
  async demoteFromAdmin(
    groupId: string,
    input: GroupDto.PromoteMemberInput,
    session: UserSession,
  ) {
    try {
      const currentUserId = session.user.id;
      const targetUserId = input.userId;

      const result = await this.prisma.$transaction(async (tx) => {
        // Fetch group with relevant memberships
        const group = await tx.group.findUnique({
          where: {
            id: groupId,
          },
          include: {
            members: {
              where: {
                userId: {
                  in: [currentUserId, targetUserId],
                },
              },
            },
            conversation: true,
          },
        });

        if (!group) {
          this.logger.log('Group not found');
          throw new BadRequestException('Group not found');
        }

        // Verify current user is a member and has admin privileges
        const currentUserMembership = group.members.find(
          (m) => m.userId === currentUserId,
        );

        if (!currentUserMembership) {
          this.logger.warn(
            `User ${currentUserId} is not a member of group ${groupId}`,
          );
          throw new BadRequestException('Group not found');
        }

        if (currentUserMembership.role !== GROUP_MEMBERSHIP.ADMIN) {
          this.logger.debug(
            `User ${currentUserId} does not have permission to demote members in group ${groupId}`,
          );
          throw new ForbiddenException('Insufficient permissions');
        }

        // Prevent self-demotion
        if (targetUserId === currentUserId) {
          this.logger.debug(
            `User ${currentUserId} attempted to demote themselves in group ${groupId}`,
          );
          throw new BadRequestException('Cannot demote yourself');
        }

        // Verify target user is a member of the group
        const targetMembership = group.members.find(
          (m) => m.userId === targetUserId,
        );

        if (!targetMembership) {
          this.logger.warn(
            `Target user ${targetUserId} is not a member of group ${groupId}`,
          );
          throw new BadRequestException('Member not found');
        }

        // Idempotent: if already a regular member, return success
        if (targetMembership.role === GROUP_MEMBERSHIP.MEMBER) {
          this.logger.log(
            `User ${targetUserId} is already a member of group ${groupId}`,
          );
          return {
            success: true,
            alreadyMember: true,
          };
        }

        // Update the member's role to regular member
        await tx.groupMember.update({
          where: {
            id: targetMembership.id,
          },
          data: {
            role: GROUP_MEMBERSHIP.MEMBER,
          },
        });

        this.logger.log(
          `User ${targetUserId} demoted to member in group ${groupId} by ${currentUserId}`,
        );

        return {
          success: true,
          alreadyMember: false,
          conversationId: group.conversation?.id,
        };
      });

      if (result.success && !result.alreadyMember && result.conversationId) {
        void this.eventEmitter.emitAsync(
          'group.member.updated',
          new MemberRoleUpdatedEvent(
            groupId,
            result.conversationId,
            targetUserId,
            GROUP_MEMBERSHIP.MEMBER,
            currentUserId,
          ),
        );
      }

      return { success: result.success, alreadyMember: result.alreadyMember };
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  /**
   * Disbands (deletes) a group and all associated data.
   * Only admins can disband a group.
   * Cascade deletes will clean up: conversation, participants, and group members.
   */
  async disbandGroup(groupId: string, session: UserSession) {
    try {
      const currentUserId = session.user.id;

      const result = await this.prisma.$transaction(async (tx) => {
        // Fetch group with the current user's membership
        const group = await tx.group.findUnique({
          where: {
            id: groupId,
          },
          include: {
            members: {
              where: {
                userId: currentUserId,
              },
            },
          },
        });

        if (!group) {
          this.logger.log('Group not found');
          throw new BadRequestException('Group not found');
        }

        const currentUserMembership = group.members.find(
          (m) => m.userId === currentUserId,
        );

        // Ensure current user is a member of the group
        if (!currentUserMembership) {
          this.logger.warn(
            `User ${currentUserId} is not a member of group ${groupId}`,
          );
          throw new BadRequestException('Group not found');
        }

        // Only admins can disband the group
        if (currentUserMembership.role !== GROUP_MEMBERSHIP.ADMIN) {
          this.logger.debug(
            `User ${currentUserId} does not have permission to disband group ${groupId}`,
          );
          throw new ForbiddenException('Insufficient permissions');
        }

        // Delete the group - cascade will clean up conversation, participants, and members
        await tx.group.delete({
          where: {
            id: groupId,
          },
        });

        this.logger.log(`Group ${groupId} disbanded by ${currentUserId}`);

        return {
          success: true,
        };
      });

      void this.eventEmitter.emitAsync(
        'group.deleted',
        new GroupDeletedEvent(groupId, currentUserId),
      );

      return result;
    } catch (e) {
      this.logger.error('Failed to disband group due to an error');
      this.logger.error(e);
      throw e;
    }
  }

  /**
   * Retrieves all groups the current user is a member of.
   * Optionally includes the latest message from each group's conversation.
   * Returns group details along with member count and user's role.
   */
  async getUserGroups(
    session: UserSession,
    includeLatestMessage: boolean = false,
  ) {
    try {
      const currentUserId = session.user.id;

      // Fetch all group memberships for the current user with group details
      const memberships = await this.prisma.groupMember.findMany({
        where: {
          userId: currentUserId,
        },
        include: {
          group: {
            include: {
              _count: {
                select: { members: true },
              },
              conversation: includeLatestMessage
                ? {
                    include: {
                      messages: {
                        orderBy: { timestamp: 'desc' },
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
                    },
                  }
                : false,
            },
          },
        },
        orderBy: {
          group: {
            updatedAt: 'desc',
          },
        },
      });

      // Transform the data into a cleaner response format
      const groups = memberships.map((membership) => {
        const group = membership.group;

        // Extract latest message if included and available
        // Type assertion needed due to Prisma's conditional include type narrowing
        const conversation = group.conversation as
          | (typeof group.conversation & {
              messages?: Array<{
                id: string;
                message: string | null;
                contentType: string;
                timestamp: Date;
                sender: {
                  id: string | null;
                  name: string;
                  image: string | null;
                };
              }>;
            })
          | null;

        const latestMessage =
          includeLatestMessage && conversation?.messages?.[0]
            ? {
                id: conversation.messages[0].id,
                message: conversation.messages[0].message,
                contentType: conversation.messages[0].contentType,
                timestamp: conversation.messages[0].timestamp,
                sender: conversation.messages[0].sender,
              }
            : null;

        console.assert(
          group.conversation?.id,
          `Conversation id is missing for group ${group.id}`,
        );

        return {
          id: group.id,
          name: group.name,
          logo: group.logo,
          description: group.description,
          memberCount: group._count.members,
          myRole: membership.role,
          createdAt: group.createdAt,
          conversationId: group.conversation?.id || '', // do not fail silently
          ...(includeLatestMessage && { latestMessage }),
        };
      });

      this.logger.log(
        `Retrieved ${groups.length} groups for user ${currentUserId}`,
      );

      return { groups };
    } catch (e) {
      this.logger.error('Failed to get user groups due to an error');
      this.logger.error(e);
      throw e;
    }
  }

  /**
   * Updates group information (name, logo, description).
   * Only admins can update the group.
   * If the name is updated, the associated conversation name is also synced.
   */
  async updateGroup(
    groupId: string,
    input: GroupDto.UpdateGroupInput,
    session: UserSession,
  ) {
    try {
      const currentUserId = session.user.id;

      return this.prisma.$transaction(async (tx) => {
        // Fetch group with current user's membership and conversation
        const group = await tx.group.findUnique({
          where: {
            id: groupId,
          },
          include: {
            members: {
              where: {
                userId: currentUserId,
              },
            },
            conversation: true,
          },
        });

        if (!group) {
          this.logger.log('Group not found');
          throw new BadRequestException('Group not found');
        }

        // Verify current user is a member and has admin privileges
        const currentUserMembership = group.members.find(
          (m) => m.userId === currentUserId,
        );

        if (!currentUserMembership) {
          this.logger.warn(
            `User ${currentUserId} is not a member of group ${groupId}`,
          );
          throw new BadRequestException('Group not found');
        }

        if (currentUserMembership.role !== GROUP_MEMBERSHIP.ADMIN) {
          this.logger.debug(
            `User ${currentUserId} does not have permission to update group ${groupId}`,
          );
          throw new ForbiddenException('Insufficient permissions');
        }

        // Build the update data object with only provided fields
        const updateData: {
          name?: string;
          logo?: string;
          description?: string;
        } = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.logo !== undefined) updateData.logo = input.logo;
        if (input.description !== undefined)
          updateData.description = input.description;

        // Update the group
        const updatedGroup = await tx.group.update({
          where: {
            id: groupId,
          },
          data: updateData,
        });

        // Sync conversation name if group name was updated
        if (input.name !== undefined && group.conversation) {
          await tx.conversation.update({
            where: {
              id: group.conversation.id,
            },
            data: {
              name: input.name,
            },
          });

          this.logger.log(
            `Synced conversation ${group.conversation.id} name to "${input.name}"`,
          );
        }

        this.logger.log(`Group ${groupId} updated by ${currentUserId}`);

        return {
          group: updatedGroup,
        };
      });
    } catch (e) {
      this.logger.error('Failed to update group due to an error');
      this.logger.error(e);
      throw e;
    }
  }
}
