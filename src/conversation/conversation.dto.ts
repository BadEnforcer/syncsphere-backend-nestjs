import { ApiProperty } from '@nestjs/swagger';

// ============== Participant Response Classes ==============

/**
 * Basic user info for DM conversations.
 */
export class DmParticipantResponse {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: 'User name' })
  name: string;

  @ApiProperty({ description: 'User email' })
  email: string;

  @ApiProperty({ description: 'User profile image URL', nullable: true })
  image: string | null;
}

/**
 * Group member with role info.
 */
export class GroupMemberWithRoleResponse {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: 'User name' })
  name: string;

  @ApiProperty({ description: 'User email' })
  email: string;

  @ApiProperty({ description: 'User profile image URL', nullable: true })
  image: string | null;

  @ApiProperty({
    description: 'Member role in the group',
    enum: ['ADMIN', 'MEMBER'],
  })
  role: string;

  @ApiProperty({ description: 'When the user joined the group' })
  joinedAt: Date;
}

/**
 * Group info for group conversations.
 */
export class GroupInfoResponse {
  @ApiProperty({ description: 'Group ID' })
  id: string;

  @ApiProperty({ description: 'Group name' })
  name: string;

  @ApiProperty({ description: 'Group logo URL', nullable: true })
  logo: string | null;

  @ApiProperty({ description: 'Group description', nullable: true })
  description: string | null;
}

// ============== Conversation Details Response Classes ==============

/**
 * Response for DM conversation details.
 */
export class DmConversationDetailsResponse {
  @ApiProperty({ description: 'Conversation ID' })
  id: string;

  @ApiProperty({ description: 'Conversation type', enum: ['dm'] })
  type: 'dm';

  @ApiProperty({ description: 'Conversation creation timestamp' })
  createdAt: Date;

  @ApiProperty({
    description: 'Details of the other participant in the DM',
    type: DmParticipantResponse,
  })
  otherParticipant: DmParticipantResponse;
}

/**
 * Response for group conversation details.
 */
export class GroupConversationDetailsResponse {
  @ApiProperty({ description: 'Conversation ID' })
  id: string;

  @ApiProperty({ description: 'Conversation type', enum: ['group'] })
  type: 'group';

  @ApiProperty({ description: 'Conversation creation timestamp' })
  createdAt: Date;

  @ApiProperty({
    description: 'Group information',
    type: GroupInfoResponse,
  })
  group: GroupInfoResponse;

  @ApiProperty({
    description: 'List of group members with their roles',
    type: [GroupMemberWithRoleResponse],
  })
  members: GroupMemberWithRoleResponse[];
}

/**
 * Union type for conversation details response.
 * Used for Swagger documentation.
 */
export type ConversationDetailsResponse =
  | DmConversationDetailsResponse
  | GroupConversationDetailsResponse;

// ============== Conversation List DTOs (moved from user module) ==============

import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Schema for getting conversations with pagination.
 */
export const GetConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export class GetConversationsQueryDto extends createZodDto(
  GetConversationsQuerySchema,
) {}

/**
 * Message sender info for last message.
 */
export class MessageSenderResponse {
  @ApiProperty({ description: 'Sender user ID' })
  id: string;

  @ApiProperty({ description: 'Sender name' })
  name: string;

  @ApiProperty({ description: 'Sender profile image URL', nullable: true })
  image: string | null;
}

/**
 * Last message info in a conversation.
 */
export class LastMessageResponse {
  @ApiProperty({ description: 'Message ID' })
  id: string;

  @ApiProperty({
    description: 'Message content or summary for deleted messages',
    nullable: true,
  })
  message: string | null;

  @ApiProperty({ description: 'Type of message content' })
  contentType: string;

  @ApiProperty({ description: 'Message timestamp' })
  timestamp: Date;

  @ApiProperty({
    description: 'Message sender details',
    type: MessageSenderResponse,
  })
  sender: MessageSenderResponse;

  @ApiProperty({ description: 'Whether the message was deleted' })
  isDeleted: boolean;
}

/**
 * Participant info for DM conversations in list view.
 */
export class ListParticipantResponse {
  @ApiProperty({ description: 'Participant user ID' })
  id: string;

  @ApiProperty({ description: 'Participant name' })
  name: string;

  @ApiProperty({ description: 'Participant profile image URL', nullable: true })
  image: string | null;

  @ApiProperty({
    description: 'Online status',
    enum: ['online', 'offline'],
  })
  status: 'online' | 'offline';

  @ApiProperty({ description: 'Last seen timestamp', nullable: true })
  lastSeenAt: Date | null;
}

/**
 * Group info for conversation list view.
 */
export class ListGroupInfoResponse {
  @ApiProperty({ description: 'Group ID' })
  id: string;

  @ApiProperty({ description: 'Group name' })
  name: string;

  @ApiProperty({ description: 'Group logo URL', nullable: true })
  logo: string | null;

  @ApiProperty({ description: 'Group description', nullable: true })
  description: string | null;

  @ApiProperty({ description: 'Number of members in the group' })
  memberCount: number;
}

/**
 * Conversation item in list response.
 */
export class ConversationListItemResponse {
  @ApiProperty({ description: 'Conversation ID' })
  id: string;

  @ApiProperty({ description: 'Whether this is a group conversation' })
  isGroup: boolean;

  @ApiProperty({
    description: 'Last message in the conversation',
    type: LastMessageResponse,
    nullable: true,
  })
  lastMessage: LastMessageResponse | null;

  @ApiProperty({ description: 'Number of unread messages' })
  unreadCount: number;

  @ApiProperty({
    description: 'Other participant details (for DMs only)',
    type: ListParticipantResponse,
    nullable: true,
  })
  participant?: ListParticipantResponse | null;

  @ApiProperty({
    description: 'Group details (for group conversations only)',
    type: ListGroupInfoResponse,
    nullable: true,
  })
  group?: ListGroupInfoResponse | null;
}

/**
 * Response for GET /conversation and GET /conversation/unread endpoints.
 */
export class GetConversationsResponse {
  @ApiProperty({
    description: 'List of user conversations',
    type: [ConversationListItemResponse],
  })
  conversations: ConversationListItemResponse[];
}
