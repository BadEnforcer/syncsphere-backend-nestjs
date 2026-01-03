import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import {
  admin,
  bearer,
  jwt,
  multiSession,
  openAPI,
  organization,
} from 'better-auth/plugins';
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
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  plugins: [openAPI(), multiSession(), admin()],
});
