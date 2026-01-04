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

  /**
   * Updates the user's invisibility status.
   * When invisible is true, the user will appear offline to others.
   */
  async updateInvisibility(userId: string, invisible: boolean) {
    try {
      this.logger.log(`Updating invisibility for user ${userId} to ${invisible}`);

      // Update the invisibility status in the database
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { invisible },
        select: {
          id: true,
          invisible: true,
        },
      });

      this.logger.log(`User ${userId} invisibility updated to ${updatedUser.invisible}`);

      return {
        invisible: updatedUser.invisible,
      };
    } catch (error) {
      this.logger.error(`Failed to update invisibility for user ${userId} due to an error`);
      this.logger.error(error);
      throw error;
    }
  }
}
