import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { GroupService } from './group.service';
import * as GroupDto from './group.dto';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '../auth/auth.decorators';
import * as AuthGuard from '../auth/auth.guard';

@UseGuards(AuthGuard.RequiredAuthGuard)
@Controller('organization/:organizationId/group')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post('/')
  async createGroup(
    @Param('organizationId') orgId: string,
    @Body(new ZodValidationPipe(GroupDto.CreateGroupSchema))
    input: GroupDto.CreateGroupInput,
    @CurrentUser() currentUser: AuthGuard.AuthUser,
  ) {
    return this.groupService.createGroup(orgId, input, currentUser);
  }

  @Post('/:groupId/add-members')
  async addMembers(
    orgId: string,
    groupId: string,
    input: GroupDto.AddMembersToGroupInput,
    @CurrentUser() currentUser: AuthGuard.AuthUser,
  ) {
    return this.groupService.addMembers(orgId, groupId, input, currentUser);
  }
}
