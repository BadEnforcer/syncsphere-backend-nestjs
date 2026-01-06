# AsyncAPI Setup and Documentation

**Date:** January 6, 2026

## Summary

Implemented AsyncAPI documentation for the WebSocket gateway using `nestjs-asyncapi`. This provides a standard way to document event-driven architectures similar to OpenAPI (Swagger) for REST APIs.

## Access

The AsyncAPI documentation is available at:
- **URL**: `http://localhost:3000/docs/websocket`
- **JSON**: `http://localhost:3000/docs/websocket-json`

## Configuration

The setup in `src/main.ts` configures the AsyncAPI document builder:

```typescript
const asyncApiConfig = new AsyncApiDocumentBuilder()
  .setTitle('SyncSphere WebSocket API')
  .setDescription('Real-time events for SyncSphere Chat')
  .setVersion('1.0')
  .setDefaultContentType('application/json')
  .addServer('ws-server', {
    url: 'ws://localhost:3000',
    protocol: 'socket.io',
  })
  .build();
```

## Documented Events

### Subscribe (Client -> Server)

| Channel | Description | Payload DTO |
|---------|-------------|-------------|
| `send_message` | Send a new message | `IncomingMessageDto` |
| `typing_start` | User started typing | `TypingEventDto` |
| `typing_stop` | User stopped typing | `TypingEventDto` |
| `mark_as_read` | Mark conversation read | `MarkAsReadEventDto` |

### Publish (Server -> Client)

| Channel | Description | Payload DTO |
|---------|-------------|-------------|
| `message` | Broadcast new message | `IncomingMessageDto` |
| `user_typing` | Broadcast typing status | `UserTypingDto` |
| `conversation_read` | Broadcast read receipt | `ConversationReadDto` |
| `user_status_change` | User online/offline | `UserStatusChangeDto` |

## Implementation Details

- **DTOs**: Created class-based DTOs in `src/chat/chat.message.dto.ts` using `createZodDto` to bridge Zod schemas with NestJS/AsyncAPI reflection.
- **Decorators**: Annotated `ChatGateway` methods with `@AsyncApiPub` and `@AsyncApiSub`.
- **Note**: `IncomingMessageDto` uses `BaseMessageSchema` as the primary representation due to limitations with Zod unions in class generation.
