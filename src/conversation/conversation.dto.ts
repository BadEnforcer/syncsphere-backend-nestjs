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
