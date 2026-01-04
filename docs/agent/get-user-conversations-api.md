# Get User Conversations API Design Decision

## Date
2026-01-04

## Summary
Implemented a `GET /user/conversations` endpoint to retrieve all conversations (both DMs and groups) for the authenticated user, with pagination, deleted message handling, and comprehensive metadata.

## Design Choices

### 1. Endpoint Design
- **Route**: `GET /user/conversations`
- **Query Params**: 
  - `limit` (number, default: 50, max: 100) - with Zod coercion
  - `offset` (number, default: 0) - with Zod coercion
- **Rationale**: 
  - Mounted in User module as user-centric operation ("get MY conversations")
  - Offset-based pagination for simplicity and ease of implementation
  - Zod coercion automatically converts string query params to numbers

### 2. Response Structure
The response includes:
- Conversation ID and type (isGroup)
- Last message with sender details
- Unread count (calculated from `lastReadAt` timestamp)
- For DMs: other participant info (name, image, online status)
- For groups: group metadata (name, logo, description, member count)

### 3. Deleted Message Handling
- **Approach**: Show summary instead of null
- **Implementation**: When `deletedAt` is not null, display "This message was deleted"
- **Metadata**: Include `isDeleted: true` flag and sender information
- **Rationale**: Frontend can show who sent the deleted message and when, providing better UX

### 4. Query Validation with Coercion
- **Schema**: Used Zod's `z.coerce.number()` for automatic type conversion
- **Validation**: 
  - `limit`: integer, min 1, max 100, default 50
  - `offset`: integer, min 0, default 0
- **Rationale**: Query params arrive as strings; coercion eliminates manual parsing and provides type safety

### 5. Response Schema Design
- **Approach**: Manual Swagger classes with `@ApiProperty` decorators
- **Classes Created**:
  - `MessageSenderResponse`
  - `LastMessageResponse`
  - `ParticipantResponse`
  - `GroupInfoResponse`
  - `ConversationResponse`
  - `GetConversationsResponse`
- **Rationale**: 
  - Provides better type safety than Zod for response types
  - Generates accurate Swagger documentation
  - Separates validation (Zod) from documentation (Swagger)

### 6. Filtering and Sorting
- **Filter**: Exclude conversations with no messages
- **Sort**: By most recent message timestamp (descending)
- **Rationale**: 
  - Empty conversations provide no value to users
  - Most recent conversations are most relevant

### 7. Unread Count Calculation
- **Logic**: Count messages where `timestamp > participant.lastReadAt` and `senderId != currentUserId`
- **Rationale**: 
  - Timestamp-based approach is simple and efficient
  - Exclude own messages from unread count
  - Uses existing `lastReadAt` field from Participant model

### 8. Online Status for DM Participants
- **Integration**: Fetches real-time status from `PresenceService`
- **Invisible Mode**: Respects user's `invisible` flag (shows offline if true)
- **Rationale**: Provides accurate presence information while respecting privacy settings

### 9. Performance Considerations
- **Optimization**: 
  - Single query to fetch all conversations with includes
  - In-memory filtering and sorting (acceptable for typical user conversation counts)
  - Pagination applied after sorting to limit response size
- **Trade-off**: N+1 queries for unread count and presence status
- **Future Enhancement**: Could batch these queries or use database-level aggregation

## Edge Cases Handled

1. **Deleted messages**: Show summary with sender info
2. **Empty conversations**: Filtered out from results
3. **Missing participant**: Handled with optional chaining
4. **Invisible users**: Status shows as 'offline'
5. **No lastReadAt**: Defaults to epoch (all messages unread)

## Alternatives Considered

1. **Cursor-based pagination**: Rejected for simplicity; offset-based is sufficient
2. **Include empty conversations**: Rejected as they provide no value
3. **Separate endpoints for DMs and groups**: Rejected to avoid code duplication
4. **Zod for response schema**: Rejected in favor of Swagger classes for better documentation

## Future Enhancements

1. Add cursor-based pagination for better performance at scale
2. Implement database-level aggregation for unread counts
3. Add filtering options (e.g., only DMs, only groups)
4. Add search functionality
5. Implement caching for frequently accessed conversations
