# Typing Indicators Design

**Date:** January 6, 2026

## Summary

Implemented WebSocket typing indicator events for real-time "user is typing" functionality.

## Design Decisions

### 1. Event Structure

**Client→Server Events:**
- `typing_start` - User starts typing
- `typing_stop` - User stops typing

**Server→Client Event:**
- `user_typing` with payload: `{ conversationId, userId, isTyping: boolean }`

**Rationale:** Single outgoing event with boolean flag is cleaner than two separate events and allows clients to handle state more easily.

### 2. No Persistence

Typing status is ephemeral and not stored in Redis or database.

**Rationale:** 
- Typing is transient UI state
- Reduces complexity and overhead
- If user disconnects, other events (`user_status_change`) handle cleanup

### 3. Participant Validation

User must be a member of the conversation to send typing events. Non-participants receive an error.

### 4. Shared Logic

Both `typing_start` and `typing_stop` delegate to a private `handleTypingEvent()` method.

**Rationale:** DRY principle - validation and broadcast logic is identical.

## Files Modified

- `src/chat/chat.message.dto.ts` - Added `TypingEventSchema`
- `src/chat/chat.gateway.ts` - Added event handlers
