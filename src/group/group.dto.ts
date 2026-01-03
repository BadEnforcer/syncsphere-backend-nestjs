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
