// src/chat/events/chat.events.ts
import { GROUP_MEMBERSHIP } from '@prisma/client';

export class GroupCreatedEvent {
  constructor(
    public readonly groupId: string,
    public readonly conversationId: string,
    public readonly creatorId: string,
    public readonly name: string,
  ) {}
}

export class UserJoinedGroupEvent {
  constructor(
    public readonly groupId: string,
    public readonly conversationId: string,
    public readonly userId: string,
    public readonly addedByUserId: string,
  ) {}
}

export class UserLeftGroupEvent {
  constructor(
    public readonly groupId: string,
    public readonly conversationId: string,
    public readonly userId: string,
    public readonly removedByUserId: string | null, // null if left by themselves
  ) {}
}

export class GroupDeletedEvent {
  constructor(
    public readonly groupId: string,
    public readonly groupName: string,
    public readonly userId: string, // Admin who deleted it
    public readonly memberIds: string[],
  ) {}
}

export class MemberRoleUpdatedEvent {
  constructor(
    public readonly groupId: string,
    public readonly conversationId: string,
    public readonly userId: string,
    public readonly newRole: GROUP_MEMBERSHIP,
    public readonly updatedByUserId: string,
  ) {}
}
