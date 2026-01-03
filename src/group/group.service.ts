import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UseGuards,
} from '@nestjs/common';
import * as GroupDto from './group.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { v7 } from 'uuid';
import * as AuthGuard from '../auth/auth.guard';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { GROUP_MEMBERSHIP } from '@prisma/client';

@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createGroup(input: GroupDto.CreateGroupInput, session: UserSession) {
    try {
      this.logger.log('Creating group with data: ', input);
      // TODO: make sure user is not blocked/banned

      return this.prisma.$transaction(async (tx) => {
        const groupId = v7();

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
            userId: session.user.id,
            role: GROUP_MEMBERSHIP.ADMIN,
          },
        });

        if (input.initialMembers && input.initialMembers.length > 0) {
          await tx.groupMember.createMany({
            data: input.initialMembers.map((member) => ({
              id: v7(),
              groupId: groupId,
              userId: member.userId,
              role: member.role,
            })),
          });
        }

        return {
          group: newGroup,
        };
      });
    } catch (err) {
      this.logger.error(err);
      throw err;
    }
  }

  async addMembers(
    groupId: string,
    input: GroupDto.AddMembersToGroupInput,
    session: UserSession,
  ) {
    try {
      const currentUserId = session.user.id;
      // TODO: also check if all users are members of the organization
      return this.prisma.$transaction(async (tx) => {
        // check group existence
        // check if user is member of a group
        // check if they have sufficient permissions
        // check for existing members
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

        // create memberships
        const verifiedUserIds = verifiedUsers.map((m) => m.id);
        const _newUserIds = verifiedUserIds.filter(
          (id) => id !== currentUserId,
        );

        const memberships = await tx.groupMember.createManyAndReturn({
          data: _newUserIds.map((member) => ({
            id: v7(),
            userId: member,
            groupId: groupId,
            role: GROUP_MEMBERSHIP.MEMBER,
          })),
        });

        return {
          memberships: memberships,
        };
      });
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  async removeMember(groupId: string, userId: string, session: UserSession) {
    try {
      const currentUserId = session.user.id;

      return this.prisma.$transaction(async (tx) => {
        // Fetch group and relevant memberships (current user + target user)
        const group = await tx.group.findUnique({
          where: {
            id: groupId,
          },
          include: {
            members: {
              where: {
                userId: {
                  in: [userId, currentUserId],
                },
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

        // Perform deletion
        await tx.groupMember.delete({
          where: {
            id: memberToRemove.id,
          },
        });

        return {
          success: true,
        };
      });
    } catch (e) {
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

      return this.prisma.$transaction(async (tx) => {
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
        };
      });
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

      return this.prisma.$transaction(async (tx) => {
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
        };
      });
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

}
