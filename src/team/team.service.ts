import { Injectable, Logger } from '@nestjs/common';
import * as TeamDto from './team.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { v7 } from 'uuid';

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
}
