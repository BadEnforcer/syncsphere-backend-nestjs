# User Status API Design Decision

## Summary

Created a `GET /user/:userId/status` API endpoint that returns a user's presence status, last seen timestamp, and invisible mode flag.

## Design Decisions

### 1. Status Determination Logic

**Decision**: Combine database `invisible` flag with Redis-based real-time presence.

**Rationale**:
- Real-time presence is tracked via `PresenceService` using Redis (already implemented for WebSocket connections)
- The `invisible` field in the database allows users to hide their online status
- When `invisible: true`, the API always returns `status: 'offline'` regardless of actual Redis presence

### 2. Module Structure

**Decision**: Create a separate `UserModule` instead of adding to existing modules.

**Rationale**:
- Follows the existing pattern (GroupModule, PrismaModule, etc.)
- Separation of concerns - user-specific endpoints stay in user module
- Easier to extend with additional user-related functionality later

### 3. PresenceService Reuse

**Decision**: Import `PresenceService` as a provider in `UserModule`.

**Rationale**:
- `PresenceService` already handles Redis-based presence tracking
- Avoids duplicating Redis logic
- Single source of truth for user presence

### 4. Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | `'online' \| 'offline'` | Effective presence (respects invisible mode) |
| `lastSeenAt` | `DateTime \| null` | Last activity timestamp from database |
| `invisible` | `boolean` | Whether user has invisible mode enabled |

## Edge Cases Handled

1. **User not found**: Returns 404 NotFoundException
2. **Invisible mode enabled**: Returns `status: 'offline'` even if user is online
3. **Null lastSeenAt**: Returns `null` (new users may not have this set)
