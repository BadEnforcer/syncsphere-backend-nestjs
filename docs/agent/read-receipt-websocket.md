# Read Receipt WebSocket Broadcast

**Date:** January 6, 2026

## Summary

Implemented real-time read receipt updates using WebSocket events in the ChatGateway.

## Client -> Server Event

### `mark_as_read`

Client emits this event when a user opens a conversation or views messages.

**Payload:**
```json
{
  "conversationId": "string"
}
```

**Server Actions:**
1. Validates payload structure (Zod)
2. Verifies user is a participant of the conversation
3. Updates `lastReadAt` timestamp for the participant in the database
4. Broadcasts `conversation_read` event to all **other** participants in the conversation

## Server -> Client Broadcast

### `conversation_read`

Sent to other participants when a user reads a conversation.

**Payload:**
```json
{
  "conversationId": "string",
  "userId": "string",       // ID of the user who read the conversation
  "readAt": "ISO8601 Date"  // Timestamp of the read action
}
```

## Security

- Users can only mark conversations as read if they are participants.
- Error events are emitted back to the sender if validation fails or conversation is not found.

## Performance Optimization

For group conversations, the server attempts to fetch participants from the Redis cache (`group:{groupId}:members`) first.
- **Cache Hit:** Uses cached member list to broadcast events (avoids DB query for participants).
- **Cache Miss:** Falls back to database query.
- **Update:** `lastReadAt` update is always a direct DB write using a targeted update on the `Participant` table.
