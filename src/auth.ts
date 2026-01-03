import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import {
  admin,
  bearer,
  jwt,
  lastLoginMethod,
  multiSession,
  openAPI,
  organization,
  phoneNumber,
  username,
} from 'better-auth/plugins';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Create a standalone PrismaClient instance for better-auth
const connectionString = process.env.DATABASE_URL;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
  },
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  plugins: [
    openAPI(),
    jwt(),
    lastLoginMethod(),
    multiSession(),
    bearer(),
    admin(),
    organization(),
    username(),
    phoneNumber({
      sendOTP(data, ctx) {
        // TODO: send OTP from here.
        console.log('Send otp data:', data);
      },
    }),
  ],
});
