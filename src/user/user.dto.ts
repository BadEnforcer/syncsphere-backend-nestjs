import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';

// Schema for updating user's invisibility status
export const UpdateInvisibilitySchema = z.object({
  invisible: z.boolean(),
});

export class UpdateInvisibilityDto extends createZodDto(
  UpdateInvisibilitySchema,
) {}

// Schema for getting user conversations with pagination
export const GetConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export class GetConversationsQueryDto extends createZodDto(
  GetConversationsQuerySchema,
) {}

// Swagger response classes for type-safe API responses

export class MessageSenderResponse {
  @ApiProperty({ description: 'Sender user ID' })
  id: string;

  @ApiProperty({ description: 'Sender name' })
  name: string;

  @ApiProperty({ description: 'Sender profile image URL', nullable: true })
  image: string | null;
}

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

export class ParticipantResponse {
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

export class GroupInfoResponse {
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

export class ConversationResponse {
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
    type: ParticipantResponse,
    nullable: true,
  })
  participant?: ParticipantResponse | null;

  @ApiProperty({
    description: 'Group details (for group conversations only)',
    type: GroupInfoResponse,
    nullable: true,
  })
  group?: GroupInfoResponse | null;
}

export class GetConversationsResponse {
  @ApiProperty({
    description: 'List of user conversations',
    type: [ConversationResponse],
  })
  conversations: ConversationResponse[];
}
