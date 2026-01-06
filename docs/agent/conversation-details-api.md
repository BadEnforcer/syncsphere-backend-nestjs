# Conversation Details API Design

**Date:** January 6, 2026

## Summary

Created a `ConversationModule` with APIs for conversation management.

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/conversation` | List all user conversations (paginated) |
| GET | `/conversation/unread` | List unread conversations only |
| GET | `/conversation/:conversationId` | Get single conversation details |

## Response Structures

### GET /conversation and GET /conversation/unread
Returns list of conversations with last message, unread count, and participant/group info.

### GET /conversation/:conversationId

**Group Conversation:**
```json
{
  "id": "conversation_id",
  "type": "group",
  "createdAt": "...",
  "group": { "id": "...", "name": "...", "logo": "...", "description": "..." },
  "members": [{ "id": "...", "name": "...", "role": "ADMIN", "joinedAt": "..." }]
}
```

**DM Conversation:**
```json
{
  "id": "conversation_id",
  "type": "dm",
  "createdAt": "...",
  "otherParticipant": { "id": "...", "name": "...", "email": "...", "image": "..." }
}
```

## Security

- User must be a participant to access conversation details
- Non-participants receive 404 (hides existence)

## Refactoring Notes

Routes were moved from `/user/conversations` to `/conversation` for better API organization.

## Files

- `src/conversation/conversation.module.ts`
- `src/conversation/conversation.service.ts`
- `src/conversation/conversation.controller.ts`
- `src/conversation/conversation.dto.ts`
