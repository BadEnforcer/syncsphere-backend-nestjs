# Design Decision: Get Unread Conversations API

**Date**: 2026-01-05
**Status**: Implemented

## 1. Context
The requirement was to implement an API endpoint `GET /user/conversations/unread` that returns conversations containing unread messages for the current user, supported by pagination (`limit`, `offset`).

## 2. Problem Statement
To identify an "unread" conversation, we must check if any message in the conversation has a `timestamp` greater than the user's `lastReadAt` timestamp in the `Participant` table.
`Unread Condition: Message.timestamp > Participant.lastReadAt`

Prisma ORM's standard `findMany` API does not currently support comparing two columns from different tables (or even the same table) in a `where` clause.

## 3. Options Considered

### Option A: In-Memory Filtering
Fetch all user conversations and filter them in the application layer (Node.js).
- **Pros**: Pure TypeScript/Prisma implementation.
- **Cons**:
  - **Inefficient Pagination**: To get the "next 50" unread items, you might need to fetch hundreds or thousands of read items effectively breaking database-level pagination.
  - **Memory Usage**: Loads unnecessary data into memory.
- **Verdict**: Rejected due to performance and scalability concerns.

### Option B: Schema Denormalization
Add a `hasUnreadMessages` boolean or `unreadCount` integer to the `Participant` model.
- **Pros**:
  - Extremely efficient reads (`where: { hasUnreadMessages: true }`).
  - Native Prisma support.
- **Cons**:
  - **Write Amplification**: Every time a message is sent to a group, the system must update the `Participant` record for *every* member. For large groups (e.g., 1000 members), this means 1000 database writes per message.
  - **Complexity**: Requires careful synchronization (transactions) to ensure accuracy.
  - **Race Conditions**: High concurrency could verify unread counts drift.
- **Verdict**: Rejected to avoid write overhead and complexity.

### Option C: Raw SQL Query (Selected)
Use `prisma.$queryRaw` to select valid conversation IDs directly from the database.
- **Pros**:
  - **Efficient**: Database engine handles the comparison and pagination.
  - **No Write Overhead**: Does not require updating multiple records on message send.
  - **Correctness**: Always reflects the current state of data.
- **Cons**:
  - Type safety is manual (need to cast result).
  - Looser coupling with Schema (table names must be manually verified).
- **Verdict**: Selected as the optimal balance between read performance, write performance, and complexity.

## 4. Implementation Details

### Service Layer (`UserService`)
- **`getUnreadUserConversations`**:
    1.  Executes a Raw SQL query to fetch IDs:
        ```sql
        SELECT c.id FROM "conversation" c
        JOIN "participant" p ON p."conversationId" = c.id
        JOIN "message" m ON m."conversation_id" = c.id
        WHERE p."userId" = $1
          AND m.timestamp > p.last_read_at
          AND m.sender_id != $1
          AND m.deleted_at IS NULL
        GROUP BY c.id
        ORDER BY MAX(m.timestamp) DESC
        LIMIT $2 OFFSET $3
        ```
    2.  Uses `findMany` with `where: { id: { in: ids } }` to fetch full conversation objects (including relations).
    3.  Sorts the result in memory to match the SQL `ORDER BY`.
    4.  Calls `_enrichConversations` to format the response.

- **`_enrichConversations` (Refactor)**:
    - Extracted logic from `getUserConversations` to standardize response formatting (calculating unread counts, helper fields) across both endpoints.

### Controller Layer (`UserController`)
- Endpoint: `@Get('/conversations/unread')`

## 5. Edge Case Handling: Unread Message Logic

### Problem: Default Timestamp collisions
Initially, `Participant` records were created with `lastReadAt` defaulting to `now()`.
If a message was sent *slightly before* the participant record was created (common in network latency or async processing scenarios), or if clocks were slightly skewed, the condition `message.timestamp > participant.lastReadAt` would evaluate to `false`.
This resulted in new messages (especially the very first message of a conversation) being effectively marked as "read" immediately for the recipient.

### Solution: Explicit Epoch Initialization
To resolve this, we now explicitly initialize `lastReadAt` to `1970-01-01T00:00:00.000Z` (Epoch 0) for **new participants** in both Direct Messages and Groups.

- **Reasoning**: By setting the read timestamp to the beginning of time, we guarantee that *any* message sent (which will have a current timestamp) satisfies `message.timestamp > participant.lastReadAt`.
- **Behavior**: The recipient sees the conversation as "Unread" until they explicitly perform a read action (updating `lastReadAt` to `now()`).
- **Implementation**:
    - `ChatGateway`: Sets `lastReadAt: new Date(0)` when creating DM participants.
    - `GroupService`: Sets `lastReadAt: new Date(0)` when adding group members.

