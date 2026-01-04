import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Schema for updating user's invisibility status
export const UpdateInvisibilitySchema = z.object({
  invisible: z.boolean(),
});

export class UpdateInvisibilityDto extends createZodDto(UpdateInvisibilitySchema) {}
