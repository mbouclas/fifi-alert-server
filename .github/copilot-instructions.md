# IMPORTANT INSTRUCTIONS - FiFi Alert Backend

## Project Overview
FiFi Alert is a geolocation-based notification system for missing pets. The backend handles:
- Location-aware push notification targeting (iOS/Android via FCM/APNs)
- Geospatial queries using PostgreSQL + PostGIS
- Alert lifecycle management (creation, publishing, resolution)
- Rate limiting and notification quality controls
- Sighting reports and community coordination



---

## General Instructions
- Always follow the instructions in this file when generating code.
- Do not make up any information. If you are unsure, ask for clarification.
- If you are unsure how to proceed, ask for clarification.
- Use context7 mcp server to get documentation on nestjs and Prisma.
- ONLY use nestjs compatible syntax. DO NOT use generic javascript syntax.
- ALWAYS consult context7 mcp server for nestjs documentation before creating a new service, middleware controllers and decorators.
- ALWAYS use the .env file for environment variables. DO NOT hardcode any values.
- NEVER run any database write operations without consulting context7 mcp server for Prisma documentation first.
- NEVER run any database operations that drop, delete or truncate tables without asking me first.
- ALWAYS prefer using the nestjs CLI for generating new service, middleware controllers, modules and decorators.
- ALWAYS prefer doing things the nestjs way. Especially when it comes to dependency injection.
- Do not hardcode any values. Always use environment variables or props to pass values.
- ALWAYS use environment variables for any URLs, keys, or other configuration values. Do not hardcode them.
- NEVER execute a prisma command that drops or resets the database without explicit confirmation from me. Always ask first. If prisma shows a warning about destructive operations, do not proceed and ask for clarification.

## Database Operations
- ALWAYS use Prisma for database access. DO NOT write raw SQL queries except for complex PostGIS queries.
- For complex geospatial queries, use Prisma.$queryRaw or Prisma.$executeRaw with proper parameterization.
- NEVER run database operations that drop, delete, or truncate tables without explicit user confirmation.
- ALWAYS use transactions for operations that modify multiple tables.
- Consult context7 for Prisma best practices before writing queries.
- Follow the schema defined in IMPLEMENTATION_PLAN.md Phase 1.
- ALWAYS use proper indexes (especially GIST indexes for geometry columns).

## Geospatial Queries (PostGIS)
- ALWAYS use PostGIS functions for distance calculations. DO NOT calculate distances in JavaScript.
- Use ST_DWithin() for proximity queries (more efficient than ST_Distance).
- ALWAYS create GIST indexes on geometry columns (e.g., `CREATE INDEX USING GIST(location_point)`).
- Store coordinates as PostGIS POINT geometry type, not separate lat/lon columns.
- Consult context7 for PostGIS best practices before writing spatial queries.
- Example distance query pattern:
  ```sql
  SELECT * FROM alerts 
  WHERE ST_DWithin(location_point, ST_SetSRID(ST_MakePoint(lon, lat), 4326), radius_meters);
  ```
- When creating controllers, services, or modules, ALWAYS use the nestjs CLI to generate them. Do not create them manually.
- When validating controller inputs, ALWAYS use DTOs and class-validator. Do not use manual validation.
- When creating new files, ALWAYS follow the existing file structure and naming conventions.

## DTOs and Validation
- ALWAYS create DTOs that match the exact schemas in API_CONTRACT.md.
- Use class-validator decorators (@IsString, @IsNumber, @IsEnum, etc.) extensively.
- Validate nested objects with @ValidateNested() and @Type() from class-transformer.
- Return 422 Unprocessable Entity for validation failures (not 400).
- Include field-specific error messages in validation responses.
- Create separate DTOs for request and response (e.g., CreateAlertDto vs AlertResponseDto).
- NEVER write quick tests, checks or validation files in the root directory. Always put them in a __tests__ folder or a tests folder.
- If you are to write to the database, ALWAYS use Prisma and NEVER use raw SQL queries. ASK FIRST before executing any database write operations.

## Testing
- ALWAYS write unit tests for any new code you write. Use Jest for testing.
- ALWAYS write integration tests for any new code you write. Use Supertest for integration testing.
- Write tests using the TDD approach where possible.
- Unit tests: Use Jest with proper mocking (especially for external services like FCM/APNs).
- Integration tests: Use Supertest with a test database (never use production/dev DB).
- Test spatial queries with actual PostGIS functions (use test fixtures with known coordinates).
- Test rate limiting behavior with mocked Redis.
- Test idempotency by sending duplicate requests with same idempotency key.
- ALWAYS test error cases (invalid input, missing data, constraint violations).
- Minimum 80% code coverage for new code.
- ALWAYS sanitize and validate any user input. Use class-validator and class-transformer for validation and transformation.
- ALWAYS follow best practices for security. Use NestJS's built-in security features.

## Guards and Authorization
- Use `@Roles()` decorator with `RolesGuard` for role-based access control (specific role names)
- Use `@MinUserLevel()` decorator with `MinUserLevelGuard` for hierarchical permission checks (lower level = higher privilege)
- ALWAYS place `BearerTokenGuard` before `RolesGuard` or `MinUserLevelGuard` in the guards array
- Example: `@UseGuards(BearerTokenGuard, MinUserLevelGuard)`
- Use `@AllowAnonymous()` decorator to make routes publicly accessible
- For admin endpoints, prefer using `@MinUserLevel(50)` for flexibility over hardcoded role names
- Document required permission level in endpoint JSDoc comments

## Error Handling
- ALWAYS handle errors gracefully. Use NestJS's built-in exception filters.
- Follow the error envelope format from API_CONTRACT.md Section 3.1.
- Map Prisma errors to appropriate HTTP status codes:
  - P2002 (unique constraint) → 409 Conflict
  - P2025 (record not found) → 404 Not Found
  - P2003 (foreign key constraint) → 422 Unprocessable Entity
- ALWAYS include error_code, message, and request_id in error responses.
- Log errors with full context (user_id, alert_id, etc.) for debugging.
- Wherever possible, use async/await for asynchronous operations. Do not use callbacks or .then()/.catch().
- ALWAYS document your code using JSDoc comments. Explain the purpose of classes, methods, and any complex logic.

## Monitoring & Observability
- Use NestJS built-in Logger with structured logging (JSON format).
- ALWAYS log important events and errors. Use NestJS's built-in logging module.
- ALWAYS log key events: alert_created, notification_sent, notification_excluded, etc.
- Include correlation IDs (request_id) in all logs for request tracing.
- Follow the event catalog from ANALYTICS_SUCCESS_SPEC.md for tracking.
- NEVER log PII (personal identifiable information) or sensitive data.
- Log anonymized IDs only (user_id, device_id, alert_id).
- Monitor logs under `/logs` folder for errors.
- ALWAYS keep your code clean and well-organized. Follow the SOLID principles of object-oriented design.
- ALWAYS use meaningful names for variables, functions, classes, and other identifiers. Avoid abbreviations and single-letter names.
- ALWAYS refactor code when necessary. Do not leave code smells or technical debt.
- ALWAYS review your code before submitting it. Check for errors, inconsistencies, and adherence to best practices.
- ALWAYS ensure that your code is compatible with the existing codebase. Do not introduce breaking changes.
- ALWAYS place documentation files under the docs folder. Create relative subfolders if necessary.
- ALWAYS create a README.md file for any new module or feature you create. Include purpose, API endpoints, dependencies, and examples.
- PREFER using TypeScript features and syntax. Do not use plain JavaScript.
- ALWAYS use ES6+ features and syntax. Do not use ES5 or older syntax.
- PREFER using Bun over Node.js wherever possible. Same for npm.
- If you're adding a new environment variable, ALWAYS update the .env.example file.
- The dev server is running on a different terminal. From here on consider the server is running (it's automatically reloading). If for any reason it's not, ask me to start it.

## Push Notifications
- NEVER send push notifications synchronously in API request handlers. ALWAYS queue them.
- Use BullMQ (Redis-backed) for notification job queues.
- Implement proper retry logic with exponential backoff for failed deliveries.
- ALWAYS log notification decisions (sent, excluded, failed) for debugging.
- Follow confidence-based styling rules from NOTIFICATION_PLAYBOOK.md.
- Track push token validity and handle expired tokens gracefully.
- Consult SYSTEM_BEHAVIOR_SPEC.md for notification targeting logic - DO NOT invent your own rules.

## Rate Limiting
- ALWAYS implement rate limits using Redis (never in-memory counters).
- Follow the hard caps defined in NOTIFICATION_PLAYBOOK.md:
  - 5 alerts per user per hour (hard stop)
  - 20 alerts per user per 24 hours (hard stop)
  - 50 alerts per user per 7 days (hard stop)
- Use NestJS throttler module with Redis adapter.
- ALWAYS return proper 429 status codes with Retry-After headers.
- Log rate limit violations for abuse detection.

## Background Jobs & Queues
- Use BullMQ for all async operations (notifications, geospatial processing, etc.).
- NEVER process long-running operations in HTTP request handlers.
- Implement proper job error handling and dead letter queues.
- Set appropriate job timeouts and retry strategies.
- Use NestJS @nestjs/bull integration for queue management.
- ALWAYS add monitoring for queue depth and processing rates.

## Idempotency
- ALL POST, PUT, DELETE endpoints MUST support idempotency keys.
- Use X-Idempotency-Key header (UUID format) as specified in API_CONTRACT.md.
- Store idempotency keys in Redis with 24-hour TTL.
- Return 409 Conflict if same key used with different request body.
- Return cached response if same key used with identical request body.

## Architecture Patterns
- Follow NestJS modular architecture (one module per domain: alerts, notifications, users, etc.).
- Use dependency injection extensively - NEVER use singletons or global state.
- Separate concerns: Controllers (HTTP), Services (business logic), Repositories (data access).
- Use NestJS Guards for authentication/authorization.
- Use NestJS Interceptors for cross-cutting concerns (logging, transformation).
- Use NestJS Pipes for validation and transformation.
- Consult context7 for NestJS architectural best practices.

## Naming Conventions
- Use camelCase for variables and functions.
- Use the IUpperCamelCase for classes and interfaces.
- Use UPPER_SNAKE_CASE for constants and environment variables.

## ROLES AND GATES
- Roles represent a user's job function and have a level (higher level = higher privilege).
- Gates represent temporary feature flags and do not have levels.
- Roles and Gates are independent; a user can have multiple roles and gates.
