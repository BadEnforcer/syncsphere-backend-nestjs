import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PresenceService } from 'src/chat/presence/presence.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
  ) {}

  /**
   * Retrieves a user's presence status, last seen timestamp, and invisible flag.
   * If the user has invisible mode enabled, status is returned as 'offline' regardless
   * of actual presence in Redis.
   *
   * @throws NotFoundException if user is not found
   */
  async getUserStatus(userId: string) {
    try {
      this.logger.log(`Fetching status for user ${userId}`);

      // Fetch user from database
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          lastSeenAt: true,
          invisible: true,
        },
      });

      if (!user) {
        this.logger.warn(`User ${userId} not found`);
        throw new NotFoundException('User not found');
      }

      // Get real-time presence status from Redis
      const presenceStatus = await this.presenceService.getStatus(userId);

      // If user is invisible, always return 'offline'
      const effectiveStatus = user.invisible ? 'offline' : presenceStatus;

      this.logger.log(
        `User ${userId} status: ${effectiveStatus}, invisible: ${user.invisible}`,
      );

      return {
        status: effectiveStatus,
        lastSeenAt: user.lastSeenAt,
        invisible: user.invisible ?? false,
      };
    } catch (error) {
      // Re-throw NotFoundException as-is
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`Failed to get user status for ${userId} due to an error`);
      this.logger.error(error);
      throw error;
    }
  }
}
