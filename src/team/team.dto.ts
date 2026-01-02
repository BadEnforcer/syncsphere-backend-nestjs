import { z } from "zod";

export const CreateTeamSchema = z.object({
    name: z.string(),
    logo: z.string().optional(),
    description: z.string().optional(),
    initialMembers: z.array(z.object({
        userId: z.string(),
        role: z.enum(['admin', 'member']).optional().default('member'),
    })).min(1),
})

export type CreateTeamInput = z.infer<typeof CreateTeamSchema>