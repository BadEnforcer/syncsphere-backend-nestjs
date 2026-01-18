import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin, multiSession, openAPI } from 'better-auth/plugins';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Create a standalone PrismaClient instance for better-auth
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [
    'https://syncsphere-backend-nestjs.vercel.app',
    'http://localhost:3000', // Add if calling from local dev
    'http://10.0.2.2:3000', // Android emulator localhost
    'flutter://',
    // Add your actual app origin here
  ],
  user: {
    additionalFields: {
      customMetadata: {
        type: 'json', // Defines this as a JSON field
        required: false,
      },
    },
  },
  session: {
    additionalFields: {
      fcmToken: {
        type: 'string',
        required: false,
        defaultValue: '',
      },
    },
  },
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  plugins: [
    openAPI(),
    multiSession(),
    admin({
      adminUserIds: [
        'PX3rDFm2S0ClZSGBaPwWvHVUTsSDfmtn',
        'j4NRLRlRHkElAYBAado73U5A0bZW1Nem',
      ],
    }),
  ],
});
