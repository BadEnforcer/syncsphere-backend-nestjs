import {
  BadRequestException,
  Injectable,
  Logger,
  UseGuards,
} from '@nestjs/common';
import * as TeamDto from './team.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { v7 } from 'uuid';
import { CurrentUser } from '../auth/auth.decorators';
import * as AuthGuard from '../auth/auth.guard';

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createTeam(orgId: string, input: TeamDto.CreateTeamInput) {
    try {
      this.logger.log('Creating team with data: ', input);

      return this.prisma.$transaction(async (tx) => {
        const teamId = v7();

        const org = await tx.organization.findUnique({
          where: {
            id: orgId,
          },
        });

        if (!org) {
          this.logger.error(`Organization ${orgId} not found`);
          throw new Error('Organization not found');
        }

        const newTeam = await tx.team.create({
          data: {
            id: teamId,
            name: input.name,
            logo: input.logo,
            description: input.description,
            organizationId: orgId,
          },
        });

        const newMembers = await tx.teamMember.createMany({
          data: input.initialMembers.map((member) => ({
            id: v7(),
            teamId: teamId,
            userId: member.userId,
            role: member.role,
          })),
        });

        return {
          team: newTeam,
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
    teamId: string,
    input: TeamDto.AddMembersToTeamInput,
    @CurrentUser() currentUser: AuthGuard.AuthUser,
  ) {
    try {
      const currentUserId = currentUser.id;

      return this.prisma.$transaction(async (tx) => {
        // check team existence
        // check if user is member of a team
        // check if they have sufficient permissions
        // check for existing members
        const team = await tx.team.findUnique({
          where: {
            id: teamId,
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

        if (!team) {
          this.logger.log('Team not found');
          throw new BadRequestException('Team not found');
        }

        this.logger.log(`Found ${team.members.length} members`);

        const currentUserTeamMembership = team.members.find(
          (m) => m.userId === currentUserId,
        );

        if (!currentUserTeamMembership) {
        }
      });
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }
}
