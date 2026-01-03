import { z } from 'zod';
import { GROUP_MEMBERSHIP } from '@prisma/client';

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

export type CreateGroupInput = z.infer<typeof CreateGroupSchema>;

export const AddMembersToGroupSchema = z.array(z.string()).min(1);

export type AddMembersToGroupInput = z.infer<typeof AddMembersToGroupSchema>;

export const RemoveMembersFromGroupSchema = z.array(z.string()).min(1);

export type RemoveMembersFromGroupInput = z.infer<
  typeof RemoveMembersFromGroupSchema
>;

export const PromoteMemberSchema = z.object({
  userId: z.string(),
});

export type PromoteMemberInput = z.infer<typeof PromoteMemberSchema>;

export const DemoteMemberSchema = z.object({
  userId: z.string(),
});

export type DemoteMemberInput = z.infer<typeof DemoteMemberSchema>;
