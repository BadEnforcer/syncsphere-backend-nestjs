// auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import * as jose from 'jose';
import { auth } from '../auth';

// Types for session and user
export interface AuthUser {
  id: string;
  name?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
  image?: string | null;
  role?: string | null;
  banned?: boolean | null;
  username?: string | null;
  phoneNumber?: string | null;
}

export interface AuthSession {
  user: AuthUser;
  session?: unknown;
}

// Cache the JWKS to avoid fetching it on every request
let jwksCache: jose.JSONWebKeySet | null = null;

/**
 * Try to verify JWT token from Authorization header
 */
async function verifyJwtToken(token: string): Promise<AuthUser | null> {
  try {
    // Fetch JWKS if not cached
    if (!jwksCache) {
      const jwksUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
      const response = await fetch(`${jwksUrl}/api/auth/jwks`);
      jwksCache = await response.json();
    }

    // Create a JWKS from the fetched keys
    const JWKS = jose.createLocalJWKSet(jwksCache!);

    // Verify the JWT token
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
      audience: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    });

    return {
      id: (payload.sub || payload.id) as string,
      name: payload.name as string | undefined,
      email: payload.email as string | undefined,
      emailVerified: payload.emailVerified as boolean | undefined,
      image: payload.image as string | undefined,
      role: payload.role as string | undefined,
      banned: payload.banned as boolean | undefined,
      username: payload.username as string | undefined,
      phoneNumber: payload.phoneNumber as string | undefined,
    };
  } catch (error) {
    // Clear cache in case of key rotation
    jwksCache = null;
    console.error('JWT verification failed:', error);
    return null;
  }
}

/**
 * Try to get session from cookies using better-auth
 */
async function getSessionFromCookies(req: Request): Promise<AuthSession | null> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    return session;
  } catch (error) {
    console.error('Cookie session verification failed:', error);
    return null;
  }
}

/**
 * Base authentication function that tries both JWT and cookie auth
 */
async function authenticate(req: Request): Promise<AuthSession | null> {
  // First, try JWT from Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const user = await verifyJwtToken(token);
    if (user) {
      return { user };
    }
  }

  // Second, try cookie-based session auth using better-auth
  const session = await getSessionFromCookies(req);
  if (session) {
    return session;
  }

  return null;
}

/**
 * Required Auth Guard - throws UnauthorizedException if not authenticated
 * Use this for protected routes that require authentication
 */
@Injectable()
export class RequiredAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    
    const authResult = await authenticate(req);
    
    if (!authResult) {
      throw new UnauthorizedException('Authentication required');
    }

    // Attach user and session to request
    req['user'] = authResult.user;
    req['session'] = authResult.session;

    return true;
  }
}

/**
 * Optional Auth Guard - allows unauthenticated access but attaches user if authenticated
 * Use this for routes where authentication is optional
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    
    const authResult = await authenticate(req);
    
    // Always allow access, but attach user if authenticated
    if (authResult) {
      req['user'] = authResult.user;
      req['session'] = authResult.session;
    } else {
      req['user'] = null;
      req['session'] = null;
    }

    return true;
  }
}

// Export default as RequiredAuthGuard for backwards compatibility
export { RequiredAuthGuard as AuthGuard };