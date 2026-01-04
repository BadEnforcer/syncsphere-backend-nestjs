# DM Conversation ID Design Decision

**Date:** 2026-01-04  
**Status:** Implemented  
**File:** `src/chat/chat.gateway.ts`

---

## Problem Statement

When creating a direct message (DM) conversation between two users, the system previously required an explicit conversation ID to be created beforehand. This added unnecessary complexity for 1-1 chats.

## Decision

Use a **deterministic conversation ID** for DMs by combining both user IDs with an underscore separator, sorted alphabetically.

**Format:** `userId1_userId2` where `userId1 < userId2` (alphabetically)

### Example
```
User A: "abc123"
User B: "xyz789"

Conversation ID: "abc123_xyz789"
```

Both users will always generate the same conversation ID regardless of who initiates the chat.

---

## Why This Approach?

| Alternative | Pros | Cons |
|-------------|------|------|
| **Separate `directChatKey` field** | Clear separation, keeps ID as CUID | Extra field, another index |
| **Two-column composite unique** | Explicit user references | More fields, must enforce sorted order |
| **Deterministic ID (chosen)** | Single field, no schema change, easy upsert | Must ensure sorted order on client |

**Chosen:** Deterministic ID because:
1. **Zero schema changes** - Uses existing `id` field
2. **Idempotent lookups** - Same two users always produce same ID
3. **Simple upsert** - Can use `upsert` with the ID directly
4. **Performance** - Single indexed field lookup

---

## Implementation Details

### Helper Method
```typescript
private isDMConversationId(conversationId: string): boolean
```
- Returns `true` if ID has exactly 2 parts separated by `_`
- Validates parts are in sorted order (`part1 < part2`)

### Message Handling Flow

1. **Detect DM format** via `isDMConversationId()`
2. **Validate sender** is one of the two user IDs in the conversation key
3. **Lookup conversation** in database
4. **Auto-create** if not found (after verifying both users exist)
5. **Continue** with normal message processing

### Auto-Creation Logic
- Verifies both users exist before creating
- Creates conversation with `isGroup: false`
- Adds both users as participants
- Logs creation for monitoring

---

## Edge Cases Handled

| Edge Case | Handling |
|-----------|----------|
| Sender not in DM ID | Returns error: "Invalid DM conversation: sender is not a participant" |
| One/both users don't exist | Returns error: "One or both users do not exist" |
| Conversation already exists | Uses existing conversation (idempotent) |
| Group conversation lookup | Unchanged behavior (falls through to existing logic) |

---

## Client Requirements

Clients **must** generate the DM conversation ID using sorted user IDs:

```typescript
function getDMConversationId(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join('_');
}
```

---

## Separator Choice

**Chosen separator:** `_` (underscore)

**Reason:** CUIDs and UUIDs do not contain underscores, making it a safe delimiter.

If user IDs could contain underscores in the future, consider using `::` or `|` instead.
