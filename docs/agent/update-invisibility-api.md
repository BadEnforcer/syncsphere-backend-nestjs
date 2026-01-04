# Update User Invisibility API

## Summary
Added a `PATCH /user/me/invisibility` endpoint that allows users to toggle their invisibility status.

## Design Decisions

### Self-Modification Only
- The endpoint uses `@Session()` to get the current authenticated user
- Users can only update their own invisibility status (no `userId` param)
- This prevents unauthorized modification of other users' visibility

### Endpoint Design
- **Route**: `PATCH /user/me/invisibility` 
- **Path Choice**: Used `/me/` pattern to clearly indicate self-modification
- **Method**: PATCH (partial update of user resource)

### Request Body
```json
{
  "invisible": true | false
}
```

### Response
Returns the updated invisibility status:
```json
{
  "invisible": true | false
}
```

## Files Modified
- `src/user/user.dto.ts` - Added `UpdateInvisibilityDto` with Zod validation
- `src/user/user.service.ts` - Added `updateInvisibility` method
- `src/user/user.controller.ts` - Added PATCH endpoint
