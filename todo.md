# SyncSphere Backend - TODO

## Phase 1: Core Features

### Message History APIs
- [x] `GET /conversations/:id/messages` - Paginated message history
- [x] `GET /conversations/:id` - Get single conversation details
- [x] Mark conversation as read API - Update `lastReadAt` for participant

### Real-time Features (WebSocket)
- [x] `typing_start` event
- [x] `typing_stop` event
- [x] Read receipt broadcast (`mark_as_read` -> `conversation_read`)

### Group Features
- [x] `GET /group/:groupId/members` - Get group members list API

---

## Phase 2: Future Enhancements

### Search
- [ ] Search messages
- [ ] Search conversations
