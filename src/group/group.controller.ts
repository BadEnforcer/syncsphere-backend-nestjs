import {
  Controller,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Get,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiParam,
  ApiCookieAuth,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { GroupService } from './group.service';
import * as GroupDto from './group.dto';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

/**
 * Controller for group management operations.
 * All endpoints require authentication.
 */
@ApiTags('Group')
@ApiCookieAuth('better-auth.session_token')
@Controller('group')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  /**
   * Returns all groups the current user is a member of.
   * Optionally includes the latest message when includeMessages=true.
   */
  @Get('/my-groups')
  @ApiQuery({
    name: 'includeMessages',
    required: false,
    type: Boolean,
    description: 'Include the latest message from each group (default: false)',
  })
  @ApiOkResponse({
    description: 'List of groups the user is a member of',
    type: GroupDto.GetUserGroupsResponse,
  })
  async getUserGroups(
    @Query() query: GroupDto.GetUserGroupsQueryDto,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.getUserGroups(currentUser, query.includeMessages);
  }

  /**
   * Creates a new group with optional initial members.
   */
  @Post('/')
  @ApiOkResponse({
    description: 'The newly created group',
    type: GroupDto.GroupOperationResponse,
  })
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
  @ApiOkResponse({
    description: 'List of newly created memberships',
    type: GroupDto.AddMembersResponse,
  })
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
  @ApiOkResponse({
    description: 'Success status of the operation',
    type: GroupDto.SuccessResponse,
  })
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
  @ApiOkResponse({
    description: 'Promotion result with success status',
    type: GroupDto.PromoteMemberResponse,
  })
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
  @ApiOkResponse({
    description: 'Demotion result with success status',
    type: GroupDto.DemoteMemberResponse,
  })
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
  @ApiOkResponse({
    description: 'Success status of the operation',
    type: GroupDto.SuccessResponse,
  })
  async disbandGroup(
    @Param('groupId') groupId: string,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.disbandGroup(groupId, currentUser);
  }

  /**
   * Updates group information (name, logo, description).
   * Only admins can update the group.
   */
  @Patch('/:groupId')
  @ApiParam({ name: 'groupId', description: 'ID of the group to update' })
  @ApiOkResponse({
    description: 'The updated group',
    type: GroupDto.GroupOperationResponse,
  })
  async updateGroup(
    @Param('groupId') groupId: string,
    @Body() input: GroupDto.UpdateGroupDto,
    @Session() currentUser: UserSession,
  ) {
    return this.groupService.updateGroup(groupId, input, currentUser);
  }
}
