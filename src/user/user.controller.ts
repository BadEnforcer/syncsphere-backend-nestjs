import { Controller, Get, Param, Patch, Body, Query } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiParam, ApiQuery, ApiOkResponse } from '@nestjs/swagger';
import { UserService } from './user.service';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { UpdateInvisibilityDto, GetConversationsQueryDto, GetConversationsResponse } from './user.dto';

/**
 * Controller for user-related operations.
 * All endpoints require authentication.
 */
@ApiTags('User')
@ApiCookieAuth('better-auth.session_token')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * Returns all conversations for the current user.
   * Includes both direct messages and group conversations with their last message and metadata.
   * Excludes conversations with no messages.
   * Sorted by most recent message first.
   */
  @Get('/conversations')
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of conversations to return (default: 50, max: 100)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Number of conversations to skip for pagination (default: 0)',
  })
  @ApiOkResponse({
    description: 'List of user conversations with metadata',
    type: GetConversationsResponse,
  })
  async getUserConversations(
    @Query() query: GetConversationsQueryDto,
    @Session() currentUser: UserSession,
  ) {
    return this.userService.getUserConversations(
      currentUser.user.id,
      query.limit,
      query.offset,
    );
  }

  /**
   * Returns the status, last seen timestamp, and invisible flag for a user.
   * If the user is in invisible mode, status will always be 'offline'.
   */
  @Get('/:userId/status')
  @ApiParam({ name: 'userId', description: 'ID of the user to get status for' })
  async getUserStatus(@Param('userId') userId: string) {
    return this.userService.getUserStatus(userId);
  }

  /**
   * Updates the current user's invisibility status.
   * When invisible is true, the user will appear offline to others.
   */
  @Patch('/me/invisibility')
  async updateInvisibility(
    @Body() dto: UpdateInvisibilityDto,
    @Session() currentUser: UserSession,
  ) {
    return this.userService.updateInvisibility(currentUser.user.id, dto.invisible);
  }
}
