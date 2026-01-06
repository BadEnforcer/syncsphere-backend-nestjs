# FCM Token Update Strategy

## Context
We needed a way to associate a Firebase Cloud Messaging (FCM) token with a user session to enable push notifications. SyncSphere uses `better-auth` for authentication.

## Problem
We initially attempted to make `fcmToken` a required additional field in the `session` schema. However, `better-auth`'s standard `signIn.email` method does not accept arbitrary additional fields in the request body to pass down to the session creation process. This caused a "fcmToken is required" validation error during sign-in.

## Considered Options

### 1. Custom Sign-In Logic
We could have written a custom sign-in wrapper or plugin that handles authentication and then manually creates the session with the token.
*   **Pros**: Atomic operation (sign-in + token set).
*   **Cons**: High complexity; fights against the `better-auth` abstraction; requires maintaining custom auth logic.

### 2. Database Hooks
We looked at using `databaseHooks` to intercept session creation.
*   **Pros**: centralized logic.
*   **Cons**: Passing the `fcmToken` from the HTTP request body to the internal database hook context is not straightforward in the standard flow without hacking the request context.

### 3. Separate Update Endpoint (Implemented)
We decided to expose a dedicated endpoint to update the session's FCM token *after* successful sign-in.
*   **Pros**:
    *   **Simplicity**: Uses standard NestJS controller/service patterns.
    *   **Separation of Concerns**: Authentication is distinct from device registration.
    *   **Flexibility**: The client can update the token at any time (e.g., token rotation), not just at sign-in.
*   **Cons**: Requires an extra network request after login.

## Implementation Details

### API Design
*   **Endpoint**: `PATCH /user/session/fcm-token`
*   **Auth**: Requires a valid session cookie.
*   **Body**: `{ "fcmToken": "string" }`
*   **Behavior**: Updates the `fcmToken` column for the *current* session ID found in the request context.

### Database Changes
*   Modified `Prisma` schema for `Session` to make `fcmToken` optional (or default to empty string) to allow initial sign-in to succeed without it.

### Security
*   The endpoint extracts the `sessionId` strictly from the secure session cookie (via `better-auth`'s `@Session` decorator), ensuring users can only update their own current session.

## Verification

To verify the endpoint, you can use the following curl command (assuming you have a valid session cookie):

```bash
curl -X PATCH http://localhost:3000/user/session/fcm-token \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN" \
  -d '{"fcmToken": "test-fcm-token"}'
```
