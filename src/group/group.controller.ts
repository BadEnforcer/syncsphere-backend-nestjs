import { Controller, Post, Body } from '@nestjs/common';
import { GroupService } from './group.service';
import * as GroupDto from './group.dto';
import { ZodValidationPipe } from 'nestjs-zod';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

@Controller('group')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post('/')
  async createGroup(
    @Body(new ZodValidationPipe(GroupDto.CreateGroupSchema))
    input: GroupDto.CreateGroupInput,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.createGroup(input, currentUser);
  }

  @Post('/:groupId/add-members')
  async addMembers(
    groupId: string,
    input: GroupDto.AddMembersToGroupInput,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.addMembers(groupId, input, currentUser);
  }
}
