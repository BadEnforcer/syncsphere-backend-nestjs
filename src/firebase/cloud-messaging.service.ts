import { Injectable, Logger } from '@nestjs/common';
import { InjectFirebaseAdmin } from 'nestjs-firebase';
import type { FirebaseAdmin } from 'nestjs-firebase';

interface NotificationPayload {
  title: string;
  body: string;
}

@Injectable()
export class CloudMessagingService {
  private readonly logger = new Logger(CloudMessagingService.name);

  constructor(
    @InjectFirebaseAdmin() private readonly firebase: FirebaseAdmin,
  ) {}

  /**
   * Sends a push notification to specific device tokens.
   */
  async sendNotification(
    tokens: string[],
    notification: NotificationPayload,
    data?: Record<string, string>,
  ) {
    if (tokens.length === 0) return;

    // Filter out empty or null tokens just in case
    const validTokens = tokens.filter((t) => t && t.length > 0);
    if (validTokens.length === 0) return;

    try {
      const response = await this.firebase.messaging.sendEachForMulticast({
        tokens: validTokens,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data,
      });

      this.logger.log(
        `Sent ${response.successCount} notifications. Failed: ${response.failureCount}`,
      );

      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            this.logger.error(
              `Failed to send to token ${validTokens[idx]}: ${resp.error?.message}`,
            );
          }
        });
      }
    } catch (e) {
      this.logger.error('Failed to send notification', e);
    }
  }

  /**
   * Sends a silent (data-only) notification.
   * Useful for instructing the app to remove a notification or sync data in background.
   */
  async sendSilentNotification(tokens: string[], data: Record<string, string>) {
    if (tokens.length === 0) return;

    const validTokens = tokens.filter((t) => t && t.length > 0);
    if (validTokens.length === 0) return;

    try {
      const response = await this.firebase.messaging.sendEachForMulticast({
        tokens: validTokens,
        data, // No 'notification' key means it's silent/data-only
      });

      this.logger.log(
        `Sent ${response.successCount} silent notifications. Failed: ${response.failureCount}`,
      );
    } catch (e) {
      this.logger.error('Failed to send silent notification', e);
    }
  }
}
