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
import { CurrentUser } from '../auth/auth.decorators';
import * as AuthGuard from '../auth/auth.guard';

@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createGroup(
    input: GroupDto.CreateGroupInput,
    @CurrentUser() currentUser: AuthGuard.AuthUser,
  ) {
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
            userId: currentUser.id,
            role: 'ADMIN',
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

  @UseGuards(AuthGuard.RequiredAuthGuard)
  async addMembers(
    groupId: string,
    input: GroupDto.AddMembersToGroupInput,
    @CurrentUser() currentUser: AuthGuard.AuthUser,
  ) {
    try {
      const currentUserId = currentUser.id;
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

        if (currentUserGroupMembership.role !== 'ADMIN') {
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
            role: 'member',
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
}
