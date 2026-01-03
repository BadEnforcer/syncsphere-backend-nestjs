import { Controller, Post, Body, Param } from '@nestjs/common';
import { TeamService } from './team.service';
import * as TeamDto from './team.dto';
import { ZodValidationPipe } from 'nestjs-zod';

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
}
