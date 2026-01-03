import { Controller, Post, Body, Param, Patch, Delete } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { GroupService } from './group.service';
import * as GroupDto from './group.dto';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

/**
 * Controller for group management operations.
 * All endpoints require authentication.
 */
@ApiTags('Group')
@ApiBearerAuth()
@Controller('group')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  /**
   * Creates a new group with optional initial members.
   */
  @Post('/')
  async createGroup(
    @Body() input: GroupDto.CreateGroupDto,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.createGroup(input, currentUser);
  }

  /**
   * Adds members to a group. Only admins can add members.
   */
  @Post('/:groupId/add-members')
  @ApiParam({ name: 'groupId', description: 'ID of the group' })
  async addMembers(
    @Param('groupId') groupId: string,
    @Body() input: GroupDto.AddMembersToGroupDto,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.addMembers(groupId, input, currentUser);
  }

  /**
   * Removes a member from a group.
   * Admins can remove any member, or a user can remove themselves.
   */
  @Post('/:groupId/remove-member/:userId')
  @ApiParam({ name: 'groupId', description: 'ID of the group' })
  @ApiParam({ name: 'userId', description: 'ID of the user to remove' })
  async removeMember(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.removeMember(groupId, userId, currentUser);
  }

  /**
   * Promotes a group member to admin.
   * Only existing admins can promote other members.
   */
  @Patch('/:groupId/members/promote')
  @ApiParam({ name: 'groupId', description: 'ID of the group' })
  async promoteToAdmin(
    @Param('groupId') groupId: string,
    @Body() input: GroupDto.PromoteMemberDto,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.promoteToAdmin(groupId, input, currentUser);
  }

  /**
   * Demotes an admin to regular member.
   * Only existing admins can demote other admins.
   */
  @Patch('/:groupId/members/demote')
  @ApiParam({ name: 'groupId', description: 'ID of the group' })
  async demoteFromAdmin(
    @Param('groupId') groupId: string,
    @Body() input: GroupDto.DemoteMemberDto,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.demoteFromAdmin(groupId, input, currentUser);
  }

  /**
   * Disbands (deletes) a group.
   * Only admins can disband a group.
   */
  @Delete('/:groupId')
  @ApiParam({ name: 'groupId', description: 'ID of the group to disband' })
  async disbandGroup(
    @Param('groupId') groupId: string,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.disbandGroup(groupId, currentUser);
  }
}
