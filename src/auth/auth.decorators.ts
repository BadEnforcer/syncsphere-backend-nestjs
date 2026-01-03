// auth.decorators.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser, AuthSession } from './auth.guard';

/**
 * Session decorator - extracts the full session object (user + session) from the request.
 * Works with both JWT and cookie-based authentication.
 * 
 * Usage:
 * ```typescript
 * @UseGuards(RequiredAuthGuard)
 * @Get('/me')
 * getProfile(@Session() session: UserSession) {
 *   return session;
 * }
 * ```
 */
export const Session = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthSession | null => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request['user'] as AuthUser | null;
    const session = request['session'];
    
    if (!user) {
      return null;
    }
    
    return {
      user,
      session,
    };
  },
);

/**
 * User decorator - extracts just the user object from the request.
 * Works with both JWT and cookie-based authentication.
 * 
 * Usage:
 * ```typescript
 * @UseGuards(RequiredAuthGuard)
 * @Get('/me')
 * getProfile(@CurrentUser() user: AuthUser) {
 *   return user;
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthUser | null => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request['user'] as AuthUser | null;
  },
);

/**
 * UserId decorator - extracts just the user ID from the request.
 * Convenient for when you only need the user's ID.
 * 
 * Usage:
 * ```typescript
 * @UseGuards(RequiredAuthGuard)
 * @Get('/my-items')
 * getItems(@UserId() userId: string) {
 *   return this.itemsService.findByUserId(userId);
 * }
 * ```
 */
export const UserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request['user'] as AuthUser | null;
    return user?.id ?? null;
  },
);

// Type alias for better compatibility with better-auth's naming
export type UserSession = AuthSession;
