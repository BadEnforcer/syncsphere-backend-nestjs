# Swagger Integration Design Decision

## Decision
Integrate `@nestjs/swagger` with `nestjs-zod` for automatic OpenAPI documentation generation.

## Approach
- Used `createZodDto()` to create class-based DTOs from existing Zod schemas
- Global `ZodValidationPipe` for request validation (moved from per-route)
- Global `ZodSerializerInterceptor` for response serialization
- `cleanupOpenApiDoc()` for proper OpenAPI 3.x output

## Trade-offs
1. **Global vs Local Pipes**: Global approach is cleaner but validates all routes. Any non-Zod routes would fail validation.
2. **No Response Schemas**: Decided not to add response DTOs to keep implementation simple. Swagger shows "200 OK" without detailed response structure.

## Files Changed
- `src/main.ts` - Swagger setup at `/docs/swagger`
- `src/app.module.ts` - Global providers
- `src/group/group.dto.ts` - DTO classes
- `src/group/group.controller.ts` - Swagger decorators
