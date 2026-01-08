import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  ApiTags,
  ApiCookieAuth,
  ApiParam,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import {
  UpdateInvisibilityDto,
  GetMembersQueryDto,
  GetMembersResponse,
  GetAllUsersStatusResponse,
  UpdateFcmTokenDto,
  UpdateProfileDto,
} from './user.dto';

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
   * Returns the online/offline status of all organization members.
   * This endpoint is cached for 5 seconds to reduce load on Redis.
   * Respects user invisibility - invisible users are shown as 'offline'.
   */
  @Get('/members/status')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(5000) // 5 seconds cache
  @ApiOkResponse({
    description:
      'List of all users with their online/offline status (cached for 5s)',
    type: GetAllUsersStatusResponse,
  })
  async getAllUsersStatus() {
    return this.userService.getAllUsersStatus();
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
   * Updates the FCM token for the current session.
   * This allows push notifications to be sent to the current device/session.
   */
  @Patch('/session/fcm-token')
  @ApiOkResponse({
    description: 'FCM token updated successfully',
  })
  async updateFcmToken(
    @Body() dto: UpdateFcmTokenDto,
    @Session() currentUser: UserSession,
  ) {
    return this.userService.updateFcmToken(
      currentUser.user.id,
      currentUser.session.token,
      dto.fcmToken,
    );
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
    return this.userService.updateInvisibility(
      currentUser.user.id,
      dto.invisible,
    );
  }

  /**
   * Updates the current user
   * New fields can be added here
   * Does not handle fields that exist in better-auth api
   */
  @Patch('/me')
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @Session() currentUser: UserSession,
  ) {
    return this.userService.updateProfile(dto, currentUser);
  }

  /**
   * Returns all organization members with pagination and optional search.
   * Excludes banned users. Supports fuzzy search on name, email, and id.
   */
  @Get('/members')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(5000) // 5 seconds cache
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of members to return (default: 20, max: 100)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Number of members to skip for pagination (default: 0)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Fuzzy search on name, email, or id',
  })
  @ApiOkResponse({
    description: 'Paginated list of organization members',
    type: GetMembersResponse,
  })
  async getAllMembers(@Query() query: GetMembersQueryDto) {
    return this.userService.getAllMembers(
      query.limit,
      query.offset,
      query.search,
    );
  }
}
