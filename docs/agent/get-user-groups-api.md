# Get User Groups API Design Decision

## Date
2026-01-03

## Summary
Implemented a `GET /group/my-groups` endpoint to retrieve all groups a user belongs to, with optional latest message inclusion.

## Design Choices

### 1. Endpoint Design
- **Route**: `GET /group/my-groups`
- **Query Param**: `includeMessages` (boolean, default: `false`)
- **Rationale**: Using a query param allows clients to control response payload size. Messages are excluded by default to optimize performance for use cases that don't need them.

### 2. Response Structure
The response includes:
- Group details (id, name, logo, description)
- Member count (via Prisma `_count`)
- User's role in the group (`myRole`)
- `latestMessage` field (only when `includeMessages=true`)

### 3. Type Handling for Conditional Include
Prisma's conditional include (`conversation: includeLatestMessage ? {...} : false`) creates a TypeScript type narrowing issue. Solved by using type assertion to properly type the `conversation` object when accessing `messages`.

### 4. Query Optimization
- Ordered results by `group.updatedAt DESC` to show recently active groups first
- Latest message fetched with `orderBy: { timestamp: 'desc' }, take: 1` to minimize data transfer
- Sender details (id, name, image) included with message for display purposes

## Alternatives Considered
1. **Separate endpoints for with/without messages**: Rejected as it would duplicate logic
2. **Always include latest message**: Rejected for performance reasons - unnecessary data transfer when not needed
3. **Pagination**: Not implemented in initial version, can be added if needed
