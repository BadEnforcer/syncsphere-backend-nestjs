import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import { Logger } from '@nestjs/common';

/**
 * Redis adapter for Socket.IO with automatic reconnection and error handling.
 *
 * Provides robust Redis connectivity for Socket.IO with:
 * - Automatic reconnection with exponential backoff
 * - Connection health monitoring
 * - Graceful error handling to prevent application crashes
 * - Proper cleanup on disconnection
 *
 * Errors thrown:
 * - Error if REDIS_URL environment variable is not defined
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);
  private pubClient: RedisClientType;
  private subClient: RedisClientType;
  private isConnecting = false;
  private isClosed = false;

  async connectToRedis(): Promise<void> {
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL is not defined');
    }

    if (this.isConnecting) {
      this.logger.warn('Redis connection already in progress');
      return;
    }

    this.isConnecting = true;

    try {
      const redisConnectionOptions = {
        url: process.env.REDIS_URL,
        socket: {
          reconnectStrategy: (retries: number) => {
            const maxReconnectDelayMs = 30000;
            const baseDelayMs = 1000;
            const delayMs = Math.min(
              baseDelayMs * Math.pow(2, retries),
              maxReconnectDelayMs,
            );

            this.logger.warn(
              `Redis reconnecting... Attempt ${retries + 1}, waiting ${delayMs}ms`,
            );

            return delayMs;
          },
          connectTimeout: 10000,
        },
      };

      this.pubClient = createClient(redisConnectionOptions);
      this.subClient = this.pubClient.duplicate();

      this.setupEventHandlers(this.pubClient, 'Pub');
      this.setupEventHandlers(this.subClient, 'Sub');

      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

      this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
      this.logger.log('Redis adapter connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Sets up event handlers for Redis client connection lifecycle events.
   * Handles errors, reconnection, and connection state changes.
   */
  private setupEventHandlers(
    client: RedisClientType,
    clientType: 'Pub' | 'Sub',
  ): void {
    client.on('error', (err: Error) => {
      this.logger.error(`Redis ${clientType} Client Error: ${err.message}`);
    });

    client.on('connect', () => {
      this.logger.log(`Redis ${clientType} Client connected`);
    });

    client.on('ready', () => {
      this.logger.log(`Redis ${clientType} Client ready`);
    });

    client.on('reconnecting', () => {
      this.logger.warn(`Redis ${clientType} Client reconnecting...`);
    });

    client.on('end', () => {
      this.logger.warn(`Redis ${clientType} Client connection ended`);
    });
  }

  createIOServer(port: number, options?: ServerOptions): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const server = super.createIOServer(port, options);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    server.adapter(this.adapterConstructor);
    return server;
  }

  /**
   * Gracefully closes Redis connections.
   * Should be called during application shutdown.
   */
  async close(): Promise<void> {
    if (this.isClosed) {
      this.logger.debug('Redis connections already closed, skipping');
      return;
    }

    this.isClosed = true;
    this.logger.log('Closing Redis connections...');

    try {
      await Promise.all([this.pubClient?.quit(), this.subClient?.quit()]);
      this.logger.log('Redis connections closed successfully');
    } catch (error) {
      this.logger.error('Error closing Redis connections', error);
    }
  }
}
