import { MessageAction, MessageContentType } from '@prisma/client';
import { z } from 'zod';

// Re-export Prisma enum for convenience
export { MessageContentType, MessageAction };

/**
 * Zod enum matching Prisma's MessageContentType.
 * Used for runtime validation of incoming message payloads.
 */
export const MessageContentTypeSchema = z.enum([
  'TEXT',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'DOCUMENT',
  'STICKER',
  'CONTACT',
  'LOCATION',
  'REACTION',
  'SYSTEM',
  'CALL',
  'UNKNOWN',
]);

// ============================================================================
// Content Schemas - Define structure for each message content type
// ============================================================================

const TextContentSchema = z.looseObject({
  contentType: z.literal('TEXT'),
  text: z.string().min(1),
  previewUrl: z.string().url().optional(),
});

const MediaBaseSchema = z.object({
  url: z.string().min(1),
  mimeType: z.string().optional(),
  fileName: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  thumbnailUrl: z.string().optional(),
});

const ImageContentSchema = z.looseObject({
  contentType: z.literal('IMAGE'),
  ...MediaBaseSchema.shape,
});

const VideoContentSchema = z.looseObject({
  contentType: z.literal('VIDEO'),
  ...MediaBaseSchema.shape,
});

const AudioContentSchema = z.looseObject({
  contentType: z.literal('AUDIO'),
  ...MediaBaseSchema.shape,
});

const DocumentContentSchema = z.looseObject({
  contentType: z.literal('DOCUMENT'),
  ...MediaBaseSchema.shape,
});

const StickerContentSchema = z.looseObject({
  contentType: z.literal('STICKER'),
  ...MediaBaseSchema.partial().shape,
});

const LocationContentSchema = z.looseObject({
  contentType: z.literal('LOCATION'),
  latitude: z.number(),
  longitude: z.number(),
  name: z.string().optional(),
  address: z.string().optional(),
});

const ContactContentSchema = z.looseObject({
  contentType: z.literal('CONTACT'),
  name: z.string().optional(),
  phones: z.array(z.string()).optional(),
  vcard: z.string().optional(),
});

const ReactionContentSchema = z.looseObject({
  contentType: z.literal('REACTION'),
  emoji: z.string().min(1),
  targetMessageId: z.string().min(1),
});

const SystemContentSchema = z.looseObject({
  contentType: z.literal('SYSTEM'),
  code: z.string().min(1),
  text: z.string().optional(),
});

const CallContentSchema = z.looseObject({
  contentType: z.literal('CALL'),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  status: z.enum(['MISSED', 'REJECTED', 'ACCEPTED', 'CANCELLED']),
  durationMs: z.number().int().nonnegative().optional(),
});

const UnknownContentSchema = z.looseObject({
  contentType: z.literal('UNKNOWN'),
  raw: z.unknown().optional(),
});

/**
 * Discriminated union of all possible message content structures.
 * The contentType field determines which schema is used for validation.
 */
export const ContentSchema = z.discriminatedUnion('contentType', [
  TextContentSchema,
  ImageContentSchema,
  VideoContentSchema,
  AudioContentSchema,
  DocumentContentSchema,
  StickerContentSchema,
  ContactContentSchema,
  LocationContentSchema,
  ReactionContentSchema,
  SystemContentSchema,
  CallContentSchema,
  UnknownContentSchema,
]);
export type Content = z.infer<typeof ContentSchema>;

/**
 * Optional metadata that can be attached to any message.
 * Stored in the `metadata` JSON field in the database.
 */
export const MetadataSchema = z
  .looseObject({
    isEdited: z.boolean().optional(),
    isForwarded: z.boolean().optional(),
    isEphemeral: z.boolean().optional(),
    expiresAt: z.coerce.date().optional(),
    mentions: z.array(z.string()).optional(),
  })
  .optional();
export type Metadata = z.infer<typeof MetadataSchema>;

// ============================================================================
// Incoming Message Schemas - For WebSocket payloads from clients
// ============================================================================

/**
 * Base schema for all incoming messages (INSERT/UPDATE actions).
 * Validates the payload structure before processing.
 */
const BaseMessageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  senderId: z.string().min(1),
  timestamp: z.coerce.date(),
  contentType: MessageContentTypeSchema,
  content: ContentSchema,
  replyToId: z.string().optional(),
  metadata: MetadataSchema,
  message: z.string().optional(),
  action: z.nativeEnum(MessageAction).default(MessageAction.INSERT),
});

/**
 * Schema for DELETE action messages.
 * Content is optional since we're deleting the message.
 */
const DeleteMessageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  senderId: z.string().min(1),
  timestamp: z.coerce.date(),
  contentType: MessageContentTypeSchema.optional(),
  content: z.unknown().optional(),
  replyToId: z.string().optional(),
  metadata: MetadataSchema,
  message: z.string().optional(),
  action: z.literal(MessageAction.DELETE),
});

/**
 * Combined schema for all incoming message types.
 * Use this to validate WebSocket message payloads.
 */
export const IncomingMessageSchema = z.union([
  DeleteMessageSchema,
  BaseMessageSchema,
]);
export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;

// ============================================================================
// Database Message Type - Matches Prisma Message model
// ============================================================================

/**
 * Represents a message as stored in the database.
 * Aligned with Prisma's Message model structure.
 */
export interface DbMessage {
  id: string;
  timestamp: Date;
  contentType: MessageContentType;
  content: Content | null;
  metadata: Metadata | null;
  message: string | null;
  action: MessageAction;
  senderId: string;
  conversationId: string;
  replyToId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Schema for creating a new message in the database.
 * Omits auto-generated fields (createdAt, updatedAt).
 */
export const CreateMessageSchema = z.object({
  id: z.string().min(1),
  timestamp: z.coerce.date(),
  contentType: MessageContentTypeSchema,
  content: ContentSchema.nullable(), // Matches Prisma: Json?
  metadata: MetadataSchema.nullable(), // Matches Prisma: Json?
  message: z.string().nullable(), // Matches Prisma: String?
  action: z.nativeEnum(MessageAction).default(MessageAction.INSERT), // Prisma enum
  senderId: z.string().min(1),
  conversationId: z.string().min(1),
  replyToId: z.string().nullable().optional(), // Matches Prisma: String?
});
export type CreateMessage = z.infer<typeof CreateMessageSchema>;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Transforms an incoming WebSocket message payload into the format
 * expected by Prisma for database insertion.
 * Handles TEXT content alignment when message field is provided.
 */
export function toCreateMessage(incoming: IncomingMessage): CreateMessage {
  let content = incoming.content as Content | null;

  // For TEXT messages, ensure content.text is populated from message field if missing
  if (
    incoming.contentType === 'TEXT' &&
    incoming.message &&
    content &&
    typeof content === 'object' &&
    !('text' in content && typeof content.text === 'string')
  ) {
    content = { ...content, contentType: 'TEXT', text: incoming.message };
  }

  return {
    id: incoming.id,
    timestamp: incoming.timestamp,
    contentType: incoming.contentType ?? 'UNKNOWN',
    content: content ?? null,
    metadata: incoming.metadata ?? null,
    message: incoming.message ?? null,
    action: incoming.action,
    senderId: incoming.senderId,
    conversationId: incoming.conversationId,
    replyToId: incoming.replyToId ?? null,
  };
}

// ============================================================================
// Typing Indicator Schemas
// ============================================================================

/**
 * Schema for typing indicator event payloads (typing_start, typing_stop).
 * Requires only the conversationId to identify where the user is typing.
 */
export const TypingEventSchema = z.object({
  conversationId: z.string().min(1),
});
export type TypingEvent = z.infer<typeof TypingEventSchema>;

// ============================================================================
// Read Receipt Schemas
// ============================================================================

/**
 * Schema for mark_as_read event payload.
 * Client sends this to mark a conversation as read.
 */
export const MarkAsReadEventSchema = z.object({
  conversationId: z.string().min(1),
});
export type MarkAsReadEvent = z.infer<typeof MarkAsReadEventSchema>;
