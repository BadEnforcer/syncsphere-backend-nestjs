# Get Conversation Messages API

**Date:** January 6, 2026

## Summary

Implemented paginated message retrieval for a conversation with caching.

## Endpoint

`GET /conversation/:conversationId/messages`

- **Auth**: Cookie Authentication (`better-auth.session_token`)
- **Access**: Participant only

### Query Parameters

| Param    | Type   | Default | Description |
|----------|--------|---------|-------------|
| `limit`  | number | 50      | Max messages to return (max 100) |
| `offset` | number | 0       | Number of messages to skip |
| `sort`   | string | 'desc'  | Sort order by timestamp ('asc', 'desc') |

### Caching

- **Strategy**: Cache the response for 5 seconds.
- **Key Format**: `conversation:{conversationId}:messages:{limit}:{offset}:{sort}`
- **TTL**: 5000 ms
- **Logic**:
  1. Verify user is a participant (DB check).
  2. Check cache.
  3. If miss, fetch from DB, transform, and set cache.
  4. If hit, return cached response.

### Response Structure

```json
{
  "data": [
    {
      "id": "...",
      "content": { ... },
      "sender": { ... },
      "timestamp": "...",
      ...
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 123,
    "hasMore": true
  }
}
```

## Security

- **Participation Check**: Strictly enforces that the requester is a participant of the conversation before even checking the cache or querying messages.
- **404 Response**: Returns 404 Not Found if user is not a participant, effectively hiding the conversation's existence.

## Files Modified

- `src/conversation/conversation.controller.ts`
- `src/conversation/conversation.service.ts`
- `src/conversation/conversation.dto.ts`
