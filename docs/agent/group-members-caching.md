# Group Members Caching Design

**Date:** January 6, 2026

## Summary

Implemented a two-tier caching strategy for group members to optimize performance.

## Caching Strategy

### Tier 1: Service-Level Cache (5 minutes)
- **Key format:** `group:${groupId}:members`
- **TTL:** 5 minutes (300,000 ms)
- **Location:** In-memory via NestJS CacheModule
- **Purpose:** Reduce database queries for frequently accessed group member lists

### Tier 2: HTTP-Level Cache (5 seconds)
- **Decorator:** `@UseInterceptors(CacheInterceptor)` + `@CacheTTL(5000)`
- **Purpose:** Fast responses for repeated API calls within short window

## Cache Invalidation

The service-level cache is invalidated when:
1. `addMembers()` - After successfully adding members to a group
2. `removeMember()` - After successfully removing a member from a group

Invalidation occurs **after** the database transaction commits to ensure consistency.

## API Endpoint

`GET /group/:groupId/members`
- Returns list of members with user details (id, name, email, image, role, joinedAt)
- Sorted by role (ADMIN first) then join date
- Requires user to be a member of the group

## Files Modified

- `src/group/group.service.ts` - Added `getGroupMembers()`, cache invalidation
- `src/group/group.controller.ts` - Added `GET /:groupId/members` endpoint
- `src/group/group.dto.ts` - Added `GetGroupMembersResponse`, `GroupMemberItemResponse`
