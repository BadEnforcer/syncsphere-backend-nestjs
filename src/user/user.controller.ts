import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiCookieAuth, ApiParam, ApiOkResponse } from '@nestjs/swagger';
import { UserService } from './user.service';

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
  @ApiOkResponse({
    description: 'User status information',
  })
  async getUserStatus(@Param('userId') userId: string) {
    return this.userService.getUserStatus(userId);
  }
}
