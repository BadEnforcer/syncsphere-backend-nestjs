# Update Group API - Design Decisions

## Overview
API endpoint to allow group admins to update group information.

## Route: `PATCH /group/:groupId`

### Route Ordering
The `PATCH /:groupId` route is placed **after** all more specific routes (like `PATCH /:groupId/members/promote`) to prevent the dynamic segment from capturing those paths. NestJS matches routes top-to-bottom.

### Authorization
- Only **admin** members can update the group
- Non-members receive "Group not found" (opacity for security)
- Regular members receive "Insufficient permissions"

### Conversation Sync
When the group `name` is updated, the associated conversation name is automatically synced to maintain consistency.

### API Behavior
- All fields (`name`, `logo`, `description`) are optional
- Only provided fields are updated (partial update semantics)
- Returns the updated group object
