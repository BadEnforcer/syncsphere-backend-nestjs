import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { GROUP_MEMBERSHIP } from '@prisma/client';

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
