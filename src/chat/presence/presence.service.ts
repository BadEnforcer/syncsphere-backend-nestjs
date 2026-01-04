import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.constants';

@Injectable()
export class PresenceService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private getPresenceKey(userId: string): string {
    return `presence:${userId}`;
  }

  async addConnection(userId: string, socketId: string) {
    const key = this.getPresenceKey(userId);
    // Add the socketId to the set
    await this.redis.sadd(key, socketId);
    // Set/Refresh the TTL for the entire set
    await this.redis.expire(key, 3600); 
  }

  async removeConnection(userId: string, socketId: string): Promise<boolean> {
    const key = this.getPresenceKey(userId);
    
    // Remove specific socket
    await this.redis.srem(key, socketId);
    
    // Check if any sessions remain
    const remainingSessions = await this.redis.scard(key);
    
    // If no sessions left, we can delete the key immediately
    if (remainingSessions === 0) {
      await this.redis.del(key);
      return true; // User is now fully offline
    }
    
    return false; // User is still online on other devices
  }

  async getStatus(userId: string): Promise<'online' | 'offline'> {
    const key = this.getPresenceKey(userId);
    const exists = await this.redis.exists(key);
    return exists ? 'online' : 'offline';
  }

  async getActiveSessionsCount(userId: string): Promise<number> {
    return await this.redis.scard(this.getPresenceKey(userId));
  }
}