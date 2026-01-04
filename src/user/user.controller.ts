import { Controller, Get, Param, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiParam } from '@nestjs/swagger';
import { UserService } from './user.service';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { UpdateInvisibilityDto } from './user.dto';

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
