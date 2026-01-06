# Conversation Details API Design

**Date:** January 6, 2026

## Summary

Created a new `ConversationModule` with `GET /conversation/:id` API to retrieve conversation details.

## API Response Structure

### Group Conversation
```json
{
  "id": "conversation_id",
  "type": "group",
  "createdAt": "2026-01-06T00:00:00Z",
  "group": {
    "id": "group_id",
    "name": "Group Name",
    "logo": "https://...",
    "description": "..."
  },
  "members": [
    {
      "id": "user_id",
      "name": "User Name",
      "email": "user@example.com",
      "image": "https://...",
      "role": "ADMIN",
      "joinedAt": "2026-01-01T00:00:00Z"
    }
  ]
}
```

### DM Conversation
```json
{
  "id": "conversation_id",
  "type": "dm",
  "createdAt": "2026-01-06T00:00:00Z",
  "otherParticipant": {
    "id": "user_id",
    "name": "User Name",
    "email": "user@example.com",
    "image": "https://..."
  }
}
```

## Security

- User must be a participant to access conversation details
- Non-participants receive 404 (hides existence)

## Files Created

- `src/conversation/conversation.module.ts`
- `src/conversation/conversation.service.ts`
- `src/conversation/conversation.controller.ts`
- `src/conversation/conversation.dto.ts`
