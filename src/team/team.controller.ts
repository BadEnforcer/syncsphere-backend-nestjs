import { Controller, Post, Body, Param } from '@nestjs/common';
import { TeamService } from './team.service';
import * as TeamDto from './team.dto';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '../auth/auth.decorators';
import * as AuthGuard from '../auth/auth.guard';

@Controller('organization/:organizationId/team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Post('/')
  async createTeam(
    @Param('organizationId') orgId: string,
    @Body(new ZodValidationPipe(TeamDto.CreateTeamSchema))
    input: TeamDto.CreateTeamInput,
  ) {
    return this.teamService.createTeam(orgId, input);
  }

  @Post('/:teamId/add-members')
  async addMembers(
    orgId: string,
    teamId: string,
    input: TeamDto.AddMembersToTeamInput,
    @CurrentUser() currentUser: AuthGuard.AuthUser,
  ) {
    return this.teamService.addMembers(orgId, teamId, input, currentUser);
  }
}
