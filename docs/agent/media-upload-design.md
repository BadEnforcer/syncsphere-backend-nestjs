# Media Upload Module - Design Decisions

## Overview

This document summarizes the key design decisions made for the media upload module.

## Architecture: Approach B - Delayed Job Pattern

**Decision**: Use database status tracking with scheduled cleanup rather than immediate job creation.

**Reason**: 
- Follows BullMQ best practices (no job cancellation anti-patterns)
- Database is source of truth for media lifecycle
- Minimal Redis memory usage
- Easy to debug via SQL queries

## Upload Flow

```
1. Client → POST /media/request-upload
   - Server creates PENDING record with 24h expiry
   - Returns presigned URL + public URL

2. Client → PUT to presigned URL (direct to R2)

3. Client → POST /media/{id}/confirm
   - Server updates status to CONFIRMED
   - Idempotent: confirming twice is safe
```

## Key Design Choices

| Decision | Choice | Reason |
|----------|--------|--------|
| Auto-deletion window | 24 hours (static) | Simple, no env var needed |
| File verification on confirm | None | User said no; skipping adds latency |
| Public vs presigned URLs | Public URLs | User requirement for chat media |
| R2 key format | `media/{userId}/{mediaId}/{filename}` | Easy to identify owner, unique per upload |
| R2 checksum config | `WHEN_REQUIRED` | R2 has limited S3 checksum support |
| S3 path style | `forcePathStyle: true` | Required for R2 presigned URLs to work |

## Prisma Schema

```prisma
enum MediaStatus {
  PENDING    // Upload URL generated, awaiting confirmation
  CONFIRMED  // Upload confirmed, file is active
}

model Media {
  id, key, filename, mimeType, size
  uploaderId → User
  status, expiresAt, confirmedAt
  createdAt, updatedAt
}
```

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/media/request-upload` | Get presigned URL |
| POST | `/media/:id/confirm` | Confirm upload complete |
| GET | `/media/:id` | Get media details (any authenticated user) |
| DELETE | `/media/:id` | Delete media + R2 object |

## Edge Cases Handled

1. **Expired upload**: Returns 400 "Upload has expired"
2. **Already confirmed**: Idempotent, returns success
3. **Not found**: Returns 404
4. **Not owner**: Returns 403

## Remaining Work

- Stage 5: Edge case testing for confirm/delete
- Stage 6: BullMQ cleanup job for orphaned PENDING uploads

---

## R2 Debugging Notes

### Issue: SignatureDoesNotMatch Error

When uploading via presigned URL, R2 returned `403 SignatureDoesNotMatch`.

### Root Causes & Fixes

| Issue | Solution |
|-------|----------|
| Virtual-hosted style URLs | Added `forcePathStyle: true` to S3Client config |
| Unsupported checksum headers | Set `requestChecksumCalculation: 'WHEN_REQUIRED'` |
| Invalid credentials | Access Key ID was incorrectly set to Account ID - regenerated R2 API token |

### Final S3Client Configuration

```typescript
new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true, // Required for R2
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
```

### Debug Test Command

```bash
# 1. Get presigned URL
curl -X POST "http://localhost:3000/media/request-upload" \
  -H "Content-Type: application/json" \
  -d '{"filename": "test.txt", "mimeType": "text/plain"}'

# 2. Upload file (use uploadUrl from response)
curl -X PUT "<uploadUrl>" --data-binary @test.txt

# 3. Verify public URL
curl "https://syncsphere.neulett.com/media/.../test.txt"
```
