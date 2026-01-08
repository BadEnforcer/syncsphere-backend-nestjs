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
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Failed to get user status for ${userId} due to an error`,
      );
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
      this.logger.log(
        `Updating invisibility for user ${userId} to ${invisible}`,
      );

      // Update the invisibility status in the database
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { invisible },
        select: {
          id: true,
          invisible: true,
        },
      });

      this.logger.log(
        `User ${userId} invisibility updated to ${updatedUser.invisible}`,
      );

      return {
        invisible: updatedUser.invisible,
      };
    } catch (error) {
      this.logger.error(
        `Failed to update invisibility for user ${userId} due to an error`,
      );
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Updates the FCM token for the current session.
   * This is used to enable push notifications for the current device.
   */
  async updateFcmToken(userId: string, sessionToken: string, fcmToken: string) {
    try {
      this.logger.log(
        `Updating FCM token for user ${userId} on session ${sessionToken.substring(0, 8)}...`,
      );

      const updatedSession = await this.prisma.session.update({
        where: { token: sessionToken },
        data: { fcmToken },
        select: {
          id: true,
          fcmToken: true,
        },
      });

      this.logger.log(`FCM token updated for user ${userId}`);

      return updatedSession;
    } catch (error) {
      this.logger.error(
        `Failed to update FCM token for user ${userId} due to an error`,
      );
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Retrieves all organization members with pagination and optional fuzzy search.
   * Excludes banned users. Returns basic member info (id, name, email, image, createdAt).
   * Fuzzy search matches against name, email, or id (case-insensitive).
   */
  async getAllMembers(limit: number = 20, offset: number = 0, search?: string) {
    try {
      this.logger.log(
        `Fetching members with limit=${limit}, offset=${offset}, search=${search ?? 'none'}`,
      );

      // Build the where clause with banned users excluded
      const whereClause = {
        banned: { not: true },
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { id: { contains: search, mode: 'insensitive' as const } },
          ],
        }),
      };

      // Execute count and find in parallel for efficiency
      const [total, members] = await Promise.all([
        this.prisma.user.count({ where: whereClause }),
        this.prisma.user.findMany({
          where: whereClause,
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
          },
          skip: offset,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      const hasMore = offset + members.length < total;

      this.logger.log(`Fetched ${members.length} members (total: ${total})`);

      return {
        data: members,
        total,
        hasMore,
      };
    } catch (error) {
      this.logger.error('Failed to fetch members due to an error');
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Fetches all non-banned users with their online/offline status.
   * Uses parallel fetching via PresenceService.getBulkStatus() for efficiency.
   * Respects user invisibility - invisible users are shown as 'offline'.
   */
  async getAllUsersStatus() {
    try {
      this.logger.log('Fetching all users status');

      // Fetch all non-banned users
      const users = await this.prisma.user.findMany({
        where: { banned: { not: true } },
        select: {
          id: true,
          name: true,
          image: true,
          invisible: true,
          role: true,
        },
        orderBy: { name: 'asc' },
      });

      // Get user IDs for bulk status lookup
      const userIds = users.map((u) => u.id);

      // Fetch all statuses in parallel
      const statusMap = await this.presenceService.getBulkStatus(userIds);

      // Build response with effective status (respecting invisibility)
      const usersWithStatus = users.map((user) => {
        const presenceStatus = statusMap.get(user.id) ?? 'offline';
        // If user is invisible, always show as offline
        const effectiveStatus = user.invisible ? 'offline' : presenceStatus;

        return {
          id: user.id,
          name: user.name,
          image: user.image,
          status: effectiveStatus,
        };
      });

      this.logger.log(`Fetched status for ${usersWithStatus.length} users`);

      return {
        data: usersWithStatus,
      };
    } catch (error) {
      this.logger.error('Failed to fetch all users status due to an error');
      this.logger.error(error);
      throw error;
    }
  }
}
