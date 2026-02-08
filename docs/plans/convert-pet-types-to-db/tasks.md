# Tasks: Convert Pet Types to Database

- [ ] Add `PetType` model in [prisma/schema.prisma](prisma/schema.prisma).
	- [ ] Fields: `id`, `name`, `slug`, `created_at`, `updated_at`.
	- [ ] Add unique index on `slug` and `name`.
	- [ ] Update `Pet.type` to reference `PetType` model (relation + foreign key).
	- [ ] Update any enum usage in the Prisma schema that conflicts with new model.
- [ ] Add Prisma migration for new model and relation changes.
- [ ] Update seed data to insert default pet types.

- [ ] Scan codebase for enum usage and replace with DB-backed reads.
	- [ ] DTOs and validation: update to accept `petTypeId` or `petTypeSlug` (per API contract).
	- [ ] Services: load pet types from Prisma instead of hardcoded enums.
	- [ ] Responses: return pet type `id`, `name`, and `slug` from DB.
	- [ ] Remove or deprecate enum exports where no longer used.

- [ ] Add CRUD endpoints for pet types.
	- [ ] Generate module/service/controller via NestJS CLI.
	- [ ] Create DTOs for create/update/list responses with class-validator.
	- [ ] Implement Prisma repository/service methods with proper error mapping.
	- [ ] Add route guards/authorization if required by API_CONTRACT.

- [ ] Tests.
	- [ ] Unit tests for service (create, update, delete, read, slug uniqueness).
	- [ ] Integration tests for CRUD endpoints (Supertest).
	- [ ] Error cases: duplicate slug, not found, invalid payload.

- [ ] Docs.
	- [ ] Update API docs to include new pet type endpoints and response shapes.
	- [ ] Update .env.example if any new config is added.
