# Group Service Design Decisions

This document records key design decisions for the Group module.

## 1. Role Management (Promote/Demote)

### Decision: Users cannot promote or demote themselves
**Date:** 2026-01-03

**Reason:** Prevents accidental self-demotion by the last admin, and maintains audit integrity (promotions should always be by another admin).

**Implementation:**
- `promoteToAdmin()` throws `BadRequestException('Cannot promote yourself')`
- `demoteFromAdmin()` throws `BadRequestException('Cannot demote yourself')`

---

## 2. Idempotent Role Operations

### Decision: promoteToAdmin and demoteFromAdmin are idempotent
**Date:** 2026-01-03

**Reason:** More RESTful, prevents race conditions, simpler client logic.

**Implementation:**
- If user is already admin during promote → returns `{ success: true, alreadyAdmin: true }`
- If user is already member during demote → returns `{ success: true, alreadyMember: true }`

---

## 3. Group-Conversation Sync

### Decision: Automatic conversation creation and participant sync
**Date:** 2026-01-03

**Reason:** Groups need a communication channel. Tying conversation lifecycle to group lifecycle ensures consistency.

**Implementation:**
- `createGroup()` creates a `Conversation` with `isGroup: true` and adds all members as `Participant`
- `addMembers()` adds new members as participants
- `removeMember()` removes participant from conversation
- All operations within same Prisma transaction

---

## 4. Removed organizationId from Conversation

### Decision: organizationId removed from Conversation schema
**Date:** 2026-01-03

**Reason:** Group doesn't have organizationId. Simpler to remove than add complexity.

**Original options:**
1. Add `organizationId` to Group creation (would require schema/API change)
2. Make `organizationId` nullable on Conversation
3. Use placeholder value

**Chosen:** Remove the field entirely from schema.

---

## 5. Last Admin Protection

### Decision: Last admin cannot remove themselves from the group
**Date:** 2026-01-03

**Reason:** Prevents orphaned groups with no admin. Ensures governance continuity.

**Implementation:**
- `removeMember()` checks if user is removing themselves AND is an admin
- If they're the only admin, throws `BadRequestException('Cannot leave group as the last admin. Please assign another admin first.')`
- Query fetches all members to count admins

