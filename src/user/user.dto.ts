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

// Schema for updating user's FCM token
export const UpdateFcmTokenSchema = z.object({
  fcmToken: z.string().min(1),
});

export class UpdateFcmTokenDto extends createZodDto(UpdateFcmTokenSchema) {}

// Schema for querying members with pagination and fuzzy search
export const GetMembersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  search: z.string().optional(),
});

export class GetMembersQueryDto extends createZodDto(GetMembersQuerySchema) {}

// Swagger response class for basic member info
export class MemberResponse {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: 'User name' })
  name: string;

  @ApiProperty({ description: 'User email' })
  email: string;

  @ApiProperty({ description: 'User profile image URL', nullable: true })
  image: string | null;

  @ApiProperty({ description: 'Account creation timestamp' })
  createdAt: Date;
}

// Paginated response wrapper for members list
export class GetMembersResponse {
  @ApiProperty({ description: 'List of members', type: [MemberResponse] })
  data: MemberResponse[];

  @ApiProperty({ description: 'Total count of members matching query' })
  total: number;

  @ApiProperty({ description: 'Whether more results are available' })
  hasMore: boolean;
}

// Swagger response class for individual user status
export class UserStatusResponse {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: 'User name' })
  name: string;

  @ApiProperty({ description: 'User profile image URL', nullable: true })
  image: string | null;

  @ApiProperty({ description: 'Online status', enum: ['online', 'offline'] })
  status: 'online' | 'offline';

  @ApiProperty({
    description: 'Roles of the user. A string but comma separated',
  })
  role: string;
}

// Response wrapper for all users status
export class GetAllUsersStatusResponse {
  @ApiProperty({
    description: 'List of users with their status',
    type: [UserStatusResponse],
  })
  data: UserStatusResponse[];
}
