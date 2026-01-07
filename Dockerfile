# ===========================
# Stage 1: Build
# ===========================
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml ./

# Copy Prisma schema for generation
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm dlx prisma generate

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# ===========================
# Stage 2: Production Dependencies
# ===========================
FROM node:22-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Copy Prisma schema (needed for Prisma client)
COPY prisma ./prisma/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Generate Prisma client
RUN pnpm dlx prisma generate

# ===========================
# Stage 3: Production (Distroless)
# ===========================
FROM gcr.io/distroless/nodejs22-debian12 AS production

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy package.json (needed for some runtime checks)
COPY --from=deps /app/package.json ./

# Set environment to production
ENV NODE_ENV=production

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["dist/src/main.js"]
