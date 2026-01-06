import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { GROUP_MEMBERSHIP } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Schema for creating a new group.
 * Includes optional initial members with their roles.
 */
export const CreateGroupSchema = z.object({
  name: z.string(),
  logo: z.string().optional(),
  description: z.string().optional(),
  initialMembers: z
    .array(
      z.object({
        userId: z.string(),
        role: z
          .enum(GROUP_MEMBERSHIP)
          .optional()
          .default(GROUP_MEMBERSHIP.MEMBER),
      }),
    )
    .optional(),
});

export class CreateGroupDto extends createZodDto(CreateGroupSchema) {}
export type CreateGroupInput = z.infer<typeof CreateGroupSchema>;

/**
 * Schema for adding members to a group.
 * Expects an array of user IDs.
 */
export const AddMembersToGroupSchema = z.array(z.string()).min(1);

export class AddMembersToGroupDto extends createZodDto(
  AddMembersToGroupSchema,
) {}
export type AddMembersToGroupInput = z.infer<typeof AddMembersToGroupSchema>;

/**
 * Schema for removing members from a group.
 * Expects an array of user IDs.
 */
export const RemoveMembersFromGroupSchema = z.array(z.string()).min(1);

export type RemoveMembersFromGroupInput = z.infer<
  typeof RemoveMembersFromGroupSchema
>;

/**
 * Schema for promoting a member to admin.
 */
export const PromoteMemberSchema = z.object({
  userId: z.string(),
});

export class PromoteMemberDto extends createZodDto(PromoteMemberSchema) {}
export type PromoteMemberInput = z.infer<typeof PromoteMemberSchema>;

/**
 * Schema for demoting an admin to regular member.
 */
export const DemoteMemberSchema = z.object({
  userId: z.string(),
});

export class DemoteMemberDto extends createZodDto(DemoteMemberSchema) {}
export type DemoteMemberInput = z.infer<typeof DemoteMemberSchema>;

/**
 * Schema for getting user groups query params.
 * Controls whether to include the latest message in the response.
 */
export const GetUserGroupsQuerySchema = z.object({
  includeMessages: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
});

export class GetUserGroupsQueryDto extends createZodDto(
  GetUserGroupsQuerySchema,
) {}
export type GetUserGroupsQueryInput = z.infer<typeof GetUserGroupsQuerySchema>;

/**
 * Schema for updating a group.
 * All fields are optional - only provided fields will be updated.
 */
export const UpdateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  logo: z.string().optional(),
  description: z.string().optional(),
});

export class UpdateGroupDto extends createZodDto(UpdateGroupSchema) {}
export type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;

// ============== Swagger Response Classes ==============

/**
 * Response class for a group object.
 */
export class GroupResponse {
  @ApiProperty({ description: 'Group ID' })
  id: string;

  @ApiProperty({ description: 'Group name' })
  name: string;

  @ApiProperty({ description: 'Group logo URL', nullable: true })
  logo: string | null;

  @ApiProperty({ description: 'Group description', nullable: true })
  description: string | null;

  @ApiProperty({ description: 'Group creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Group last updated timestamp' })
  updatedAt: Date;
}

/**
 * Response wrapper for single group operations (create, update).
 */
export class GroupOperationResponse {
  @ApiProperty({
    description: 'The group object',
    type: GroupResponse,
  })
  group: GroupResponse;
}

// ============== /my-groups Response Classes ==============

/**
 * Message sender info for latest message.
 */
export class LatestMessageSenderResponse {
  @ApiProperty({ description: 'Sender user ID' })
  id: string;

  @ApiProperty({ description: 'Sender name' })
  name: string;

  @ApiProperty({ description: 'Sender profile image URL', nullable: true })
  image: string | null;
}

/**
 * Latest message info for a group.
 */
export class LatestMessageResponse {
  @ApiProperty({ description: 'Message ID' })
  id: string;

  @ApiProperty({ description: 'Message content', nullable: true })
  message: string | null;

  @ApiProperty({ description: 'Type of message content' })
  contentType: string;

  @ApiProperty({ description: 'Message timestamp' })
  timestamp: Date;

  @ApiProperty({
    description: 'Message sender details',
    type: LatestMessageSenderResponse,
  })
  sender: LatestMessageSenderResponse;
}

/**
 * User's group item with membership details.
 */
export class UserGroupItemResponse {
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

  @ApiProperty({
    description: "Current user's role in the group",
    enum: ['ADMIN', 'MEMBER'],
  })
  myRole: string;

  @ApiProperty({ description: 'Group creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Conversation ID for this group' })
  conversationId: string;

  @ApiProperty({
    description: 'Latest message (only when includeMessages=true)',
    type: LatestMessageResponse,
    nullable: true,
    required: false,
  })
  latestMessage?: LatestMessageResponse | null;
}

/**
 * Response for GET /my-groups endpoint.
 */
export class GetUserGroupsResponse {
  @ApiProperty({
    description: 'List of groups the user is a member of',
    type: [UserGroupItemResponse],
  })
  groups: UserGroupItemResponse[];
}

// ============== Membership Response Classes ==============

/**
 * Group membership item returned when adding members.
 */
export class GroupMembershipResponse {
  @ApiProperty({ description: 'Membership ID' })
  id: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Group ID' })
  groupId: string;

  @ApiProperty({ description: 'Member role', enum: ['ADMIN', 'MEMBER'] })
  role: string;

  @ApiProperty({ description: 'Membership creation timestamp' })
  createdAt: Date;
}

/**
 * Response for POST /:groupId/add-members endpoint.
 */
export class AddMembersResponse {
  @ApiProperty({
    description: 'List of newly created memberships',
    type: [GroupMembershipResponse],
  })
  memberships: GroupMembershipResponse[];
}

// ============== Success Response Classes ==============

/**
 * Generic success response for operations.
 */
export class SuccessResponse {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;
}

/**
 * Response for promote member endpoint.
 */
export class PromoteMemberResponse {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({
    description: 'Whether the user was already an admin',
    required: false,
  })
  alreadyAdmin?: boolean;
}

/**
 * Response for demote member endpoint.
 */
export class DemoteMemberResponse {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({
    description: 'Whether the user was already a regular member',
    required: false,
  })
  alreadyMember?: boolean;
}

// ============== Get Group Members Response Classes ==============

/**
 * Individual group member item with user details.
 */
export class GroupMemberItemResponse {
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
 * Response for GET /:groupId/members endpoint.
 */
export class GetGroupMembersResponse {
  @ApiProperty({
    description: 'List of group members with user details',
    type: [GroupMemberItemResponse],
  })
  members: GroupMemberItemResponse[];
}
