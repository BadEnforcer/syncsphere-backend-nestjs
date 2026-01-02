import { z } from "zod";

export const CreateTeamSchema = z.object({
    name: z.string(),
    logo: z.string().optional(),
    description: z.string().optional(),
    initialMembers: z.array(z.object({
        userId: z.string(),
        role: z.enum(['admin', 'member']).optional().default('member'),
    })).min(1).refine((members) => members.some((m) => m.role === 'admin'), {
        message: "At least one member must be an admin",
    }),
})

export type CreateTeamInput = z.infer<typeof CreateTeamSchema>