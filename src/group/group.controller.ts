import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { GroupService } from './group.service';
import * as GroupDto from './group.dto';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '../auth/auth.decorators';
import * as AuthGuard from '../auth/auth.guard';

@UseGuards(AuthGuard.RequiredAuthGuard)
@Controller('group')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post('/')
  async createGroup(
    @Body(new ZodValidationPipe(GroupDto.CreateGroupSchema))
    input: GroupDto.CreateGroupInput,
    @CurrentUser() currentUser: AuthGuard.AuthUser,
  ) {
    return this.groupService.createGroup(input, currentUser);
  }

  @Post('/:groupId/add-members')
  async addMembers(
    groupId: string,
    input: GroupDto.AddMembersToGroupInput,
    @CurrentUser() currentUser: AuthGuard.AuthUser,
  ) {
    return this.groupService.addMembers(groupId, input, currentUser);
  }
}
