# Redis Adapter Refactor

**Date:** January 6, 2026

## Summary

Refactored `RedisIoAdapter` to use `ioredis` instead of `node-redis` to resolve connection leak issues and consolidate dependencies.

## Changes

- **Dependency**: Removed `redis` package. Now relying solely on `ioredis` (already used by `RedisModule` and `BullMQ`).
- **Adapter Logic**:
  - Replaced `createClient` with `new Redis()`.
  - Implemented custom retry strategy using `ioredis` configuration:
    - Max delay: 30s
    - Backoff: `min(times * 1000, 30000)`
  - Used `maxRetriesPerRequest: null` as recommended for Pub/Sub.
  - Simplified connection handling using `ioredis` events.

## Why ioredis?

- **Stability**: `ioredis` generally provides more robust connection management and auto-reconnection logic out of the box.
- **Consistency**: The project was already using `ioredis` for the main `RedisModule` and queues. Using the same library everywhere reduces bundle size and complexity.
- **Connection Leaks**: The previous `node-redis` implementation with manual reconnection logic was suspected of causing connection leaks (`ENOSPC` or hitting max connections). `ioredis` handles this internally more gracefully.

## Verification

- **Build**: Successful (`pnpm run build`).
- **Connections**: Should now maintain a stable number of connections (typically 2 for Pub/Sub + 1 for general commands).
