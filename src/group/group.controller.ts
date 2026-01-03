import { Controller, Post, Body, Param, Patch, Delete } from '@nestjs/common';
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
    @Param('groupId') groupId: string,
    @Body(new ZodValidationPipe(GroupDto.AddMembersToGroupSchema))
    input: GroupDto.AddMembersToGroupInput,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.addMembers(groupId, input, currentUser);
  }

  @Post('/:groupId/remove-member/:userId')
  async removeMember(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.removeMember(groupId, userId, currentUser);
  }

  @Patch('/:groupId/members/promote')
  async promoteToAdmin(
    @Param('groupId') groupId: string,
    @Body(new ZodValidationPipe(GroupDto.PromoteMemberSchema))
    input: GroupDto.PromoteMemberInput,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.promoteToAdmin(groupId, input, currentUser);
  }

  @Patch('/:groupId/members/demote')
  async demoteFromAdmin(
    @Param('groupId') groupId: string,
    @Body(new ZodValidationPipe(GroupDto.PromoteMemberSchema))
    input: GroupDto.PromoteMemberInput,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.demoteFromAdmin(groupId, input, currentUser);
  }

  @Delete('/:groupId')
  async disbandGroup(
    @Param('groupId') groupId: string,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.disbandGroup(groupId, currentUser);
  }
}
