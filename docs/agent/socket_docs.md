# WebSocket Gateway Documentation

**Gateway:** `ChatGateway` (`src/chat/chat.gateway.ts`)  
**Protocol:** Socket.IO  
**Authentication:** Required (better-auth session in headers)

## Overview

The ChatGateway handles all real-time WebSocket communication for the SyncSphere chat application. All connections require authentication via session headers.

---

## Connection & Disconnection Events

### Connection

When a client successfully connects:

**Automatic Actions:**
- User joins room: `user:{userId}`
- Updates Redis presence
- Broadcasts status change to all other clients

**Server Response:**
- Event: `user_status_change`
- Payload:
  ```json
  {
    "userId": "string",
    "status": "online"
  }
  ```

### Disconnection

When a client disconnects:

**Automatic Actions:**
- Removes connection from Redis presence
- Updates user's `lastSeenAt` timestamp
- Broadcasts offline status only if user is completely offline (no other active sessions)

**Server Response:**
- Event: `user_status_change`
- Payload:
  ```json
  {
    "userId": "string",
    "status": "offline"
  }
  ```

---

## Client → Server Events

### 1. `send_message`

Sends a new message, updates an existing message, or deletes a message.

**Input Payload:**

For INSERT/UPDATE actions:
```json
{
  "id": "string (required)",
  "conversationId": "string (required)",
  "senderId": "string (required, must match authenticated user)",
  "timestamp": "ISO8601 datetime string (required)",
  "contentType": "TEXT | IMAGE | VIDEO | AUDIO | DOCUMENT | STICKER | CONTACT | LOCATION | REACTION | SYSTEM | CALL | UNKNOWN",
  "content": {
    // Content structure varies by contentType (see Content Types section)
  },
  "replyToId": "string (optional)",
  "metadata": {
    "isEdited": "boolean (optional)",
    "isForwarded": "boolean (optional)",
    "isEphemeral": "boolean (optional)",
    "expiresAt": "ISO8601 datetime string (optional)",
    "mentions": ["string[] (optional)"]
  },
  "message": "string (optional, fallback text)",
  "action": "INSERT | UPDATE (defaults to INSERT)"
}
```

For DELETE action:
```json
{
  "id": "string (required)",
  "conversationId": "string (required)",
  "senderId": "string (required)",
  "timestamp": "ISO8601 datetime string (required)",
  "contentType": "string (optional)",
  "content": "any (optional)",
  "replyToId": "string (optional)",
  "metadata": "object (optional)",
  "message": "string (optional)",
  "action": "DELETE"
}
```

**Server Actions:**
1. Validates payload structure
2. Verifies `senderId` matches authenticated user
3. Validates conversation exists (or creates DM if needed)
4. Validates user is a participant
5. Saves/updates/deletes message in database
6. Broadcasts to all conversation participants via `message` event
7. Sends push notifications to offline participants

**Server Responses:**

**Success:**
- Event: `message` (broadcast to all conversation participants)
- Payload: Same as input payload (validated and persisted)

**Error:**
- Event: `err`
- Payload:
  ```json
  {
    "message": "Error description",
    "data": "original payload"
  }
  ```

**Error Cases:**
- `Failed to parse message payload` - Invalid payload structure
- `Please user the senderID of the logged in User` - senderId mismatch
- `Invalid DM conversation: sender is not a participant` - Invalid DM participant
- `One or both users do not exist` - DM users don't exist
- `Conversation not found` - Conversation doesn't exist
- `User is not a member of the group` - User not a participant
- `Failed to parse message payload when saving to DB` - DB validation error

---

### 2. `typing_start`

Indicates user has started typing in a conversation.

**Input Payload:**
```json
{
  "conversationId": "string (required)"
}
```

**Server Actions:**
1. Validates payload structure
2. Verifies conversation exists
3. Verifies user is a participant
4. Broadcasts `user_typing` event to all OTHER participants

**Server Responses:**

**Success:**
- Event: `user_typing` (broadcast to other participants only)
- Payload:
  ```json
  {
    "conversationId": "string",
    "userId": "string",
    "isTyping": true
  }
  ```

**Error:**
- Event: `err`
- Payload:
  ```json
  {
    "message": "Invalid typing event payload | Conversation not found | User is not a member of this conversation",
    "data": "original payload"
  }
  ```

---

### 3. `typing_stop`

Indicates user has stopped typing in a conversation.

**Input Payload:**
```json
{
  "conversationId": "string (required)"
}
```

**Server Actions:**
1. Validates payload structure
2. Verifies conversation exists
3. Verifies user is a participant
4. Broadcasts `user_typing` event to all OTHER participants

**Server Responses:**

**Success:**
- Event: `user_typing` (broadcast to other participants only)
- Payload:
  ```json
  {
    "conversationId": "string",
    "userId": "string",
    "isTyping": false
  }
  ```

**Error:**
- Event: `err`
- Payload:
  ```json
  {
    "message": "Invalid typing event payload | Conversation not found | User is not a member of this conversation",
    "data": "original payload"
  }
  ```

---

### 4. `mark_as_read`

Marks a conversation as read for the authenticated user.

**Input Payload:**
```json
{
  "conversationId": "string (required)"
}
```

**Server Actions:**
1. Validates payload structure
2. Verifies conversation exists
3. Verifies user is a participant (uses cache for groups if available)
4. Updates `lastReadAt` timestamp in database
5. Broadcasts `conversation_read` event to all OTHER participants

**Server Responses:**

**Success:**
- Event: `conversation_read` (broadcast to other participants only)
- Payload:
  ```json
  {
    "conversationId": "string",
    "userId": "string",
    "readAt": "ISO8601 datetime string"
  }
  ```

**Error:**
- Event: `err`
- Payload:
  ```json
  {
    "message": "Invalid mark_as_read event payload | Conversation not found | User is not a member of this conversation",
    "data": "original payload"
  }
  ```

---

## Server → Client Events

### 1. `message`

Broadcasted to all participants when a message is sent, updated, or deleted.

**Payload:**

Same structure as `send_message` input (see above), with message persisted to database.

**Special Cases:**
- System messages are sent for group events (creation, user joined/left, member role updates)
- Delete actions result in messages with `action: "DELETE"` and `deletedAt` timestamp set

---

### 2. `user_typing`

Broadcasted when a user starts or stops typing.

**Payload:**
```json
{
  "conversationId": "string",
  "userId": "string",
  "isTyping": "boolean"
}
```

**Note:** Only sent to OTHER participants, not to the user who triggered it.

---

### 3. `conversation_read`

Broadcasted when a user marks a conversation as read.

**Payload:**
```json
{
  "conversationId": "string",
  "userId": "string (user who read the conversation)",
  "readAt": "ISO8601 datetime string"
}
```

**Note:** Only sent to OTHER participants, not to the user who marked it as read.

---

### 4. `user_status_change`

Broadcasted when a user comes online or goes offline.

**Payload:**
```json
{
  "userId": "string",
  "status": "online" | "offline"
}
```

**Triggers:**
- **online:** Automatically sent when user connects
- **offline:** Only sent when user disconnects and has no other active sessions

---

### 5. `group.deleted`

Broadcasted to all group members when a group is deleted.

**Payload:**
```json
{
  "groupId": "string",
  "groupName": "string",
  "deletedBy": "string (userId of admin who deleted)"
}
```

**Note:** This is sent directly to group members, not via a system message.

---

### 6. `err`

Error response sent to the client when validation fails or errors occur.

**Payload:**
```json
{
  "message": "string (error description)",
  "data": "any (original payload that caused error)"
}
```

---

## Message Content Types

The `content` field structure varies by `contentType`:

### TEXT
```json
{
  "contentType": "TEXT",
  "text": "string (required)",
  "previewUrl": "string (optional URL)"
}
```

### IMAGE, VIDEO, AUDIO, DOCUMENT
```json
{
  "contentType": "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT",
  "url": "string (required)",
  "mimeType": "string (optional)",
  "fileName": "string (optional)",
  "sizeBytes": "number (optional, non-negative integer)",
  "width": "number (optional, positive integer)",
  "height": "number (optional, positive integer)",
  "durationMs": "number (optional, non-negative integer)",
  "thumbnailUrl": "string (optional)"
}
```

### STICKER
```json
{
  "contentType": "STICKER",
  // All MediaBaseSchema fields are optional for stickers
  "url": "string (optional)",
  "mimeType": "string (optional)",
  // ... etc
}
```

### LOCATION
```json
{
  "contentType": "LOCATION",
  "latitude": "number (required)",
  "longitude": "number (required)",
  "name": "string (optional)",
  "address": "string (optional)"
}
```

### CONTACT
```json
{
  "contentType": "CONTACT",
  "name": "string (optional)",
  "phones": ["string[] (optional)"],
  "vcard": "string (optional)"
}
```

### REACTION
```json
{
  "contentType": "REACTION",
  "emoji": "string (required, min length 1)",
  "targetMessageId": "string (required, min length 1)"
}
```

### SYSTEM
```json
{
  "contentType": "SYSTEM",
  "code": "string (required, min length 1)",
  "text": "string (optional)"
}
```

**System Message Types:**
- `group_created` - When a group is created
- `user_joined` - When a user joins a group
- `user_left` - When a user leaves a group  
- `member_updated` - When a member's role changes

### CALL
```json
{
  "contentType": "CALL",
  "direction": "INBOUND" | "OUTBOUND",
  "status": "MISSED" | "REJECTED" | "ACCEPTED" | "CANCELLED",
  "durationMs": "number (optional, non-negative integer)"
}
```

### UNKNOWN
```json
{
  "contentType": "UNKNOWN",
  "raw": "any (optional)"
}
```

---

## Message Actions

- **INSERT** - Create a new message (default)
- **UPDATE** - Update an existing message (modifies content, metadata, message fields)
- **DELETE** - Soft delete a message (sets `deletedAt` timestamp)

---

## Conversation ID Formats

### Direct Messages (DM)
Format: `userId1_userId2` (alphabetically sorted)

Example: `abc123_def456` where `abc123 < def456` alphabetically

**Behavior:**
- Automatically created when first message is sent
- Both users must exist
- Sender must be one of the two users

### Group Conversations
Format: Any string (typically UUID)

---

## Security & Validation

1. **Authentication:** All connections require valid session headers
2. **Sender Verification:** `senderId` must match authenticated user
3. **Participant Verification:** User must be a participant to send messages
4. **DM Validation:** Sender must be one of the two users in DM conversation
5. **Payload Validation:** All payloads are validated using Zod schemas

---

## Performance Optimizations

- **Read Receipts:** For group conversations, participants are fetched from Redis cache (`group:{groupId}:members`) if available
- **Presence:** Uses Redis to track multiple connections per user (only broadcasts offline when completely offline)
- **Message Upsert:** Uses upsert for INSERT actions to handle duplicates gracefully (idempotent)

---

## Notes

- System messages are automatically generated for group events (created, user joined/left, member role updated)
- System messages use `contentType: "SYSTEM"` and are persisted to the database
- Push notifications are sent to offline participants for new messages (except system messages)
- Typing indicators are ephemeral and not persisted
- Delete actions result in soft deletes (sets `deletedAt` timestamp)
- All timestamps are in ISO8601 datetime format
