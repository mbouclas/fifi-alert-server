# Pet Management Implementation Task List

## Overview
Implement pet management functionality allowing users to register and manage their pets within the FiFi Alert system. Each user can have multiple pets, and pets can be marked as missing to trigger alerts.

## Pet Model Specification
A pet belongs to a user and has the following attributes:
- **type**: Enum (DOG, CAT, etc.) - required
- **name**: String - required
- **gender**: Enum (MALE, FEMALE) - optional
- **photo(s)**: Array of URLs/paths - optional
- **size**: Enum (SMALL, MEDIUM, LARGE) - optional
- **isMissing**: Boolean, defaults to false - required
- **tagId**: String (auto-generated, max 9 chars, unique) - required
- **birthday**: Date - optional
- **created_at**: DateTime - auto-generated
- **updated_at**: DateTime - auto-updated

## Tasks

### 1. Create Prisma Models
**Description**: Define the Pet model schema in Prisma with proper relations to User model.

**Acceptance Criteria**:
- [x] Create `Pet` model in `prisma/schema.prisma`
- [x] Define all required fields with proper types
- [x] Add enums for `PetType` (DOG, CAT, etc.), `Gender` (MALE, FEMALE), and `Size` (SMALL, MEDIUM, LARGE)
- [x] Set up one-to-many relationship: User → Pets
- [x] Add unique constraint on `tagId`
- [x] Add index on `userId` for query optimization
- [x] Add index on `tagId` for lookups
- [x] Set default value for `isMissing` to false
- [x] Set `@updatedAt` on `updated_at` field

**Implementation Notes**:
```prisma
model Pet {
  id         String   @id @default(cuid())
  tagId      String   @unique @db.VarChar(9)
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  type       PetType
  name       String   @db.VarChar(100)
  gender     Gender?
  photos     String[]
  size       Size?
  isMissing  Boolean  @default(false)
  birthday   DateTime?
  
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
  
  @@index([userId])
  @@index([tagId])
  @@map("pets")
}

enum PetType {
  DOG
  CAT
  BIRD
  RABBIT
  OTHER
}

enum Gender {
  MALE
  FEMALE
}

enum Size {
  SMALL
  MEDIUM
  LARGE
}
```

---

### 2. Create Database Migrations
**Description**: Generate and apply Prisma migrations for the Pet model.

**Acceptance Criteria**:
- [x] Run `bunx prisma migrate dev --name add_pet_model` to create migration
- [x] Review generated SQL migration files
- [x] Verify foreign key constraints are correct
- [x] Verify indexes are created properly
- [x] Test migration on development database
- [x] Document migration in migration log
- [x] Update `User` model to include `pets Pet[]` relation field

**Commands**:
```bash
# Generate migration
bunx prisma migrate dev --name add_pet_model

# Generate Prisma Client
bunx prisma generate

# Verify migration
bunx prisma migrate status
```

---

### 3. Create Pet Service
**Description**: Implement PetService with business logic for pet management.

**Acceptance Criteria**:
- [x] Generate service using NestJS CLI: `nest g service pet`
- [x] Inject PrismaService for database access
- [x] Implement `generateTagId()` method (e.g., alphanumeric, 9 chars, collision-resistant)
- [x] Implement `createPet(userId: string, data: CreatePetDto): Promise<Pet>`
- [x] Implement `findAllByUser(userId: string): Promise<Pet[]>`
- [x] Implement `findOne(id: string, userId?: string): Promise<Pet>`
- [x] Implement `findByTagId(tagId: string): Promise<Pet>`
- [x] Implement `updatePet(id: string, userId: string, data: UpdatePetDto): Promise<Pet>`
- [x] Implement `deletePet(id: string, userId: string): Promise<void>`
- [x] Implement `markAsMissing(id: string, userId: string): Promise<Pet>`
- [x] Implement `markAsFound(id: string, userId: string): Promise<Pet>`
- [x] Add proper error handling (pet not found, unauthorized access)
- [x] Add validation to prevent duplicate tagIds
- [x] Write unit tests for all methods (80%+ coverage)

**File Location**: `src/pet/pet.service.ts`

**Error Cases to Handle**:
- Pet not found (404)
- User not authorized to access/modify pet (403)
- Duplicate tagId collision (retry generation)
- Invalid pet data (422)

---

### 4. Create Pet DTOs
**Description**: Create Data Transfer Objects for request validation and response formatting.

**Acceptance Criteria**:
- [x] Create `CreatePetDto` with class-validator decorators
- [x] Create `UpdatePetDto` (partial of CreatePetDto)
- [x] Create `PetResponseDto` for API responses
- [x] Add validation rules:
  - `name`: @IsString(), @Length(1, 100)
  - `type`: @IsEnum(PetType)
  - `gender`: @IsOptional(), @IsEnum(Gender)
  - `size`: @IsOptional(), @IsEnum(Size)
  - `photos`: @IsOptional(), @IsArray(), @IsUrl({}, { each: true })
  - `birthday`: @IsOptional(), @IsDate(), @Type(() => Date)
- [x] Include tagId in response DTO (read-only)
- [x] Exclude sensitive fields if necessary

**File Locations**: 
- `src/pet/dto/create-pet.dto.ts`
- `src/pet/dto/update-pet.dto.ts`
- `src/pet/dto/pet-response.dto.ts`

---

### 5. Create Pet Controller
**Description**: Implement REST API endpoints for pet management (admin/general access).

**Acceptance Criteria**:
- [x] Generate controller: `nest g controller pet`
- [x] Add authentication guard (@UseGuards)
- [x] Implement CRUD endpoints:
  - [x] `GET /pets` - List all pets (filter by user, missing status) [Admin only]
  - [x] `GET /pets/:id` - Get pet by ID
  - [x] `GET /pets/tag/:tagId` - Get pet by tag ID (public lookup)
  - [x] `POST /pets` - Create new pet
  - [x] `PUT /pets/:id` - Update pet
  - [x] `DELETE /pets/:id` - Delete pet
  - [x] `PATCH /pets/:id/missing` - Mark pet as missing
  - [x] `PATCH /pets/:id/found` - Mark pet as found
- [x] Use DTOs for request/response
- [x] Add proper HTTP status codes
- [x] Add request validation with ValidationPipe
- [x] Add rate limiting for public endpoints
- [x] Add Swagger/OpenAPI decorators (@ApiTags, @ApiOperation, etc.)
- [x] Write integration tests for all endpoints

**File Location**: `src/pet/pet.controller.ts`

**API Routes**:
```
GET    /pets              (Admin: list all pets)
GET    /pets/:id          (Get pet details)
GET    /pets/tag/:tagId   (Public: lookup by tag)
POST   /pets              (Create pet)
PUT    /pets/:id          (Update pet)
DELETE /pets/:id          (Delete pet)
PATCH  /pets/:id/missing  (Mark as missing)
PATCH  /pets/:id/found    (Mark as found)
```

---

### 6. Add Pet Management to User Controller
**Description**: Add user-specific pet management endpoints to UserController.

**Acceptance Criteria**:
- [x] Add `GET /users/:userId/pets` - List all pets for a user
- [x] Add `GET /users/:userId/pets/:petId` - Get specific pet for a user
- [x] Add `POST /users/:userId/pets` - Register a new pet for a user
- [x] Add `PUT /users/:userId/pets/:petId` - Update user's pet
- [x] Add `DELETE /users/:userId/pets/:petId` - Delete user's pet
- [x] Ensure user can only access their own pets (unless admin)
- [x] Use @CurrentUser() decorator to get authenticated user
- [x] Inject PetService into UserController
- [x] Add proper authorization checks
- [x] Add Swagger documentation
- [x] Write integration tests

**File Location**: `src/user/user.controller.ts`

**API Routes**:
```
GET    /users/:userId/pets          (List user's pets)
GET    /users/:userId/pets/:petId   (Get user's pet)
POST   /users/:userId/pets          (Create pet for user)
PUT    /users/:userId/pets/:petId   (Update user's pet)
DELETE /users/:userId/pets/:petId   (Delete user's pet)
```

**Authorization Rules**:
- Users can only manage their own pets
- Admins can manage any user's pets
- Public can view pets by tagId only

---

### 7. Create Pet Module
**Description**: Create NestJS module to encapsulate pet functionality.

**Acceptance Criteria**:
- [x] Generate module: `nest g module pet`
- [x] Register PetService as provider
- [x] Register PetController
- [x] Export PetService for use in other modules
- [x] Import required modules (PrismaModule, etc.)
- [x] Update AppModule imports if necessary

**File Location**: `src/pet/pet.module.ts`

---

### 8. Integration with Alert System
**Description**: Ensure alerts can reference pets and vice versa.

**Acceptance Criteria**:
- [x] Add optional `petId` field to Alert model
- [x] Add `alerts Alert[]` relation to Pet model
- [x] Update AlertService to accept petId when creating alerts
- [x] Update alert creation DTO to include petId
- [x] When pet is marked as missing, optionally auto-create alert
- [x] When pet is found, optionally resolve related alerts
- [x] Add migration for alert-pet relationship

**Implementation Note**: This connects the pet system to the core alert functionality.

---

### 9. Update API Documentation
**Description**: Document all new endpoints in API contract and Postman collection.

**Acceptance Criteria**:
- [x] Update `docs/CLIENT_INTEGRATION_GUIDE.md` with pet endpoints
- [x] Add pet management section to API documentation
- [x] Update Postman collection with pet endpoints
- [x] Add example requests/responses
- [x] Document authentication requirements
- [x] Document rate limits
- [x] Add pet-related error codes

---

### 10. Write E2E Tests
**Description**: Create comprehensive end-to-end tests for pet management flow.

**Acceptance Criteria**:
- [x] Create `test/pet.e2e-spec.ts`
- [x] Test complete user journey:
  1. User registers a pet
  2. User lists their pets
  3. User updates pet details
  4. User marks pet as missing
  5. User marks pet as found
  6. User deletes pet
- [x] Test authorization (user can't access other user's pets)
- [x] Test public tag lookup
- [x] Test validation errors
- [x] Test with multiple pets per user
- [x] Test cascading deletes (user deleted → pets deleted)
- [x] Test pet-alert integration workflow

**File Location**: `test/pet.e2e-spec.ts`

---

## Implementation Order
1. Prisma Models & Migrations (Tasks 1-2)
2. Service Layer (Task 3)
3. DTOs (Task 4)
4. Controllers (Tasks 5-6)
5. Module Setup (Task 7)
6. Alert Integration (Task 8)
7. Documentation & Testing (Tasks 9-10)

## Technical Considerations

### Tag ID Generation
- Use a collision-resistant algorithm (e.g., nanoid with custom alphabet)
- Format: Alphanumeric, uppercase, max 9 characters
- Example: `PET7K9X2A`
- Implement retry logic if collision detected (unlikely but possible)

### Photo Storage
- Store as array of URLs (string[])
- Photos uploaded via separate upload endpoint
- Reference URLs stored in pet record
- Consider: max 5 photos per pet

### Performance
- Index on `userId` for fast user pet queries
- Index on `tagId` for fast public lookups
- Consider pagination for large pet lists

### Security
- Validate user owns pet before any modification
- Rate limit public tag lookups to prevent abuse
- Sanitize file uploads for photos

### Future Enhancements (Not in MVP)
- Breed field
- Medical records
- Microchip number
- Vaccination records
- Multiple owners per pet
- Pet sharing/visibility controls

## Dependencies
- Prisma (ORM)
- class-validator (DTO validation)
- class-transformer (DTO transformation)
- @nestjs/swagger (API documentation)
- nanoid (for tagId generation)

## Testing Strategy
- **Unit Tests**: All service methods (Jest)
- **Integration Tests**: All controller endpoints (Supertest)
- **E2E Tests**: Complete user workflows
- **Target Coverage**: 80%+ for new code

## Rollout Plan
1. Deploy schema changes (migrations)
2. Deploy service/controller code
3. Update API documentation
4. Notify clients of new endpoints
5. Monitor for errors in first 48 hours

---

## Notes
- Follow NestJS conventions and project structure
- Use environment variables for configuration
- Implement proper logging for all operations
- Consider GDPR implications for pet photos (user data)
- Ensure all endpoints are documented in Swagger
