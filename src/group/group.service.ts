import {
  BadRequestException,
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

  async createGroup(orgId: string, input: GroupDto.CreateGroupInput) {
    try {
      this.logger.log('Creating group with data: ', input);

      return this.prisma.$transaction(async (tx) => {
        const groupId = v7();

        const org = await tx.organization.findUnique({
          where: {
            id: orgId,
          },
        });

        if (!org) {
          this.logger.error(`Organization ${orgId} not found`);
          throw new Error('Organization not found');
        }

        const newGroup = await tx.group.create({
          data: {
            id: groupId,
            name: input.name,
            logo: input.logo,
            description: input.description,
            organizationId: orgId,
          },
        });

        const newMembers = await tx.groupMember.createMany({
          data: input.initialMembers.map((member) => ({
            id: v7(),
            groupId: groupId,
            userId: member.userId,
            role: member.role,
          })),
        });

        return {
          group: newGroup,
          members: newMembers,
        };
      });
    } catch (err) {
      this.logger.error(err);
      throw err;
    }
  }

  @UseGuards(AuthGuard.RequiredAuthGuard)
  async addMembers(
    orgId: string,
    groupId: string,
    input: GroupDto.AddMembersToGroupInput,
    @CurrentUser() currentUser: AuthGuard.AuthUser,
  ) {
    try {
      const currentUserId = currentUser.id;

      return this.prisma.$transaction(async (tx) => {
        // check group existence
        // check if user is member of a group
        // check if they have sufficient permissions
        // check for existing members
        const group = await tx.group.findUnique({
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
        });

        if (!group) {
          this.logger.log('Group not found');
          throw new BadRequestException('Group not found');
        }

        this.logger.log(`Found ${group.members.length} members`);

        const currentUserGroupMembership = group.members.find(
          (m) => m.userId === currentUserId,
        );

        if (!currentUserGroupMembership) {
        }
      });
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }
}
