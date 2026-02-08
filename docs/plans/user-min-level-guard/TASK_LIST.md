# MinUserLevel Guard Implementation Task List

## Overview
Implement a guard that validates if a user's role level meets a minimum threshold. This guard should be applicable at both controller and route levels using a `@MinUserLevel(X)` decorator, where X is the minimum required level.

## Context
- **Existing Role System**: The `Role` model has a `level` field (Int) where lower values = higher privileges
- **Existing Infrastructure**: `RolesGuard` and `@Roles()` decorator pattern already exist
- **Helper Method Available**: `UserService.userHasMinLevel(user, minLevel)` already implements the logic
- **Auth Flow**: BearerTokenGuard must run first to attach user to request

---

## Tasks

### 1. Create MinUserLevel Decorator
**File**: `src/auth/decorators/min-user-level.decorator.ts`

**Requirements**:
- [x] Create a custom decorator that accepts a numeric level parameter
- [x] Use `SetMetadata` to store the minimum level requirement
- [x] Export a unique metadata key constant (e.g., `MIN_USER_LEVEL_KEY`)
- [x] Add JSDoc comments with usage examples
- [x] Follow the existing pattern from `roles.decorator.ts`

**Example Usage**:
```typescript
// Controller level
@MinUserLevel(50)
export class AdminController { ... }

// Route level
@MinUserLevel(50)
@Get('admin/settings')
async getSettings() { ... }
```

**Acceptance Criteria**:
- Decorator can be applied at both class and method level
- Metadata is properly stored and retrievable
- Documentation includes examples for both use cases

---

### 2. Create MinUserLevelGuard
**File**: `src/auth/guards/min-user-level.guard.ts`

**Requirements**:
- [x] Implement `CanActivate` interface
- [x] Inject `Reflector` for metadata retrieval
- [x] Use `getAllAndOverride` to get min level from decorator (checks method first, then class)
- [x] Return `true` if no min level is specified (no restriction)
- [x] Check for `ALLOW_ANONYMOUS_KEY` and allow if set
- [x] Extract user from request (attached by BearerTokenGuard)
- [x] Throw `ForbiddenException` if user is not authenticated
- [x] Call `UserService.userHasMinLevel(user, minLevel)` to validate
- [x] Throw `ForbiddenException` with descriptive message if level insufficient
- [x] Return `true` if user meets the level requirement

**Error Messages**:
- User not authenticated: `"User not authenticated"`
- Insufficient level: `"Insufficient permissions. Minimum role level required: {X}"`

**Acceptance Criteria**:
- Guard respects decorator precedence (method > class)
- Guard works with existing BearerTokenGuard
- Guard allows anonymous routes if marked
- Proper error messages for different failure scenarios
- Follows NestJS guard best practices

---

### 3. Update Auth Module
**File**: `src/auth/auth.module.ts`

**Requirements**:
- [x] Export `MinUserLevelGuard` if not already auto-exported
- [x] Ensure guard is available for dependency injection
- [x] Verify no circular dependencies

**Acceptance Criteria**:
- Guard is accessible from other modules
- No build errors or circular dependency warnings

---

### 4. Create Unit Tests for MinUserLevel Decorator
**File**: `src/auth/decorators/__tests__/min-user-level.decorator.spec.ts`

**Test Cases**:
- [x] Sets metadata with correct key
- [x] Stores the provided level value
- [x] Metadata is retrievable via Reflector

**Acceptance Criteria**:
- All tests pass
- 100% code coverage for decorator

---

### 5. Create Unit Tests for MinUserLevelGuard
**File**: `src/auth/guards/__tests__/min-user-level.guard.spec.ts`

**Test Cases**:
- [x] Allows access when no min level is specified
- [x] Allows access when route is marked as anonymous
- [x] Throws ForbiddenException when user is not authenticated
- [x] Allows access when user has exactly the minimum level
- [x] Allows access when user has higher level (lower number)
- [x] Denies access when user has lower level (higher number)
- [x] Method-level decorator overrides class-level decorator
- [x] Works correctly when user has multiple roles
- [x] Throws proper error messages

**Mock Setup**:
- Mock Reflector
- Mock ExecutionContext
- Mock Request with user
- Mock ITokenUser with roles

**Acceptance Criteria**:
- All tests pass
- 100% code coverage for guard
- Tests cover both success and failure paths
- Tests verify error messages

---

### 6. Create Integration Tests
**File**: `test/min-user-level-guard.e2e-spec.ts`

**Test Scenarios**:
- [x] Controller-level guard blocks unauthorized users
- [x] Route-level guard blocks unauthorized users
- [x] Route-level decorator overrides controller-level
- [x] Guard works with BearerTokenGuard in sequence
- [x] Returns 403 Forbidden with proper error message
- [x] Allows access for users with sufficient level
- [x] Works with @UseGuards(BearerTokenGuard, MinUserLevelGuard)

**Test Setup**:
- Create test users with different role levels
- Create test controller with both class and method decorators
- Test full request/response cycle

**Acceptance Criteria**:
- All integration tests pass
- Tests verify actual HTTP responses
- Tests cover decorator precedence
- Tests verify guard order matters

---

### 7. Documentation Updates

#### 7.1. Create Guard Documentation
**File**: `docs/modules/auth/MIN_USER_LEVEL_GUARD.md`

**Content**:
- [x] Purpose and use cases
- [x] How it differs from RolesGuard
- [x] Installation/setup instructions
- [x] Usage examples (controller and route level)
- [x] Guard order requirements (must come after BearerTokenGuard)
- [x] Error handling examples
- [x] Best practices
- [x] Common pitfalls
- [x] Troubleshooting guide

#### 7.2. Update Main Documentation
**Files to Update**:
- [x] `docs/BEARER_TOKEN_QUICKSTART.md` - Add MinUserLevel example
- [x] `README.md` - Add to Features section if applicable
- [x] `.github/copilot-instructions.md` - Add guard usage guidelines

**Acceptance Criteria**:
- Documentation is clear and comprehensive
- Examples are copy-paste ready
- Common issues are documented

---

### 8. Add Example Usage in Existing Controllers
**Target Controllers** (pick 1-2 for examples):
- [x] Add `@MinUserLevel()` to an appropriate admin controller/route
- [x] Update controller comments to reference the guard
- [x] Ensure proper guard order: `@UseGuards(BearerTokenGuard, MinUserLevelGuard)`

**Implementation**:
- ✅ Updated `src/admin/admin.controller.ts` with hierarchical level requirements:
  - Controller-level: `@MinUserLevel(100)` (all admins)
  - Ban/unban users: `@MinUserLevel(10)` (super admins only)
  - Role management: `@MinUserLevel(10)` (super admins only)
  - Session revocation: `@MinUserLevel(50)` (moderate admins)
  - Stats/listing: `@MinUserLevel(100)` (all admins) - inherited from controller

**Suggested Locations**:
- Admin endpoints that need elevated access
- User management endpoints
- System configuration endpoints

**Acceptance Criteria**:
- Example usage is functional
- Guards are in correct order
- Tests verify the protection works

---

### 9. Performance Considerations
**Tasks**:
- [x] Verify `userHasMinLevel` doesn't cause N+1 queries
- [x] Ensure roles are included in user object from token
- [x] Document any performance implications
- [x] Add caching if needed (likely not necessary for metadata)

**Acceptance Criteria**:
- No additional database queries per request
- Guard execution is fast (< 1ms)
- Memory usage is minimal

---

### 10. Code Review Checklist
**Pre-Merge Verification**:
- [x] All tests pass (unit + integration)
- [x] Code coverage meets minimum (80%)
- [x] ESLint passes with no warnings
- [x] TypeScript compilation successful
- [x] No console.log statements
- [x] JSDoc comments are complete
- [x] Error messages are user-friendly
- [x] Follows NestJS conventions
- [x] Follows existing project patterns (see RolesGuard)
- [x] Documentation is complete and accurate
- [x] No hardcoded values
- [x] Proper dependency injection
- [x] No circular dependencies

---

## Implementation Order
1. Decorator → Guard → Tests (TDD approach preferred)
2. Unit tests before integration tests
3. Documentation after functional code is working
4. Example usage as final step

## Dependencies
- `@nestjs/common`
- `@nestjs/core` (Reflector)
- Existing `UserService.userHasMinLevel` method
- Existing `BearerTokenGuard`
- Existing role system (Role model with level field)

## Success Criteria
- ✅ Decorator works at both class and method level
- ✅ Guard correctly validates user role levels
- ✅ Method-level decorator overrides class-level
- ✅ Proper error messages and status codes
- ✅ All tests pass with >80% coverage
- ✅ Documentation is complete
- ✅ At least one real-world usage example exists
- ✅ No breaking changes to existing code
- ✅ Follows NestJS best practices

## Notes
- **Level Semantics**: Lower level = higher privilege (e.g., level 10 = admin, level 100 = user)
- **Guard Order**: `BearerTokenGuard` must run before `MinUserLevelGuard`
- **Multiple Roles**: If user has multiple roles, only ONE needs to meet the minimum level
- **Consistency**: Follow the exact same pattern as `RolesGuard` and `@Roles()` decorator
- **NEVER Hardcode**: Use environment variables or decorator parameters for levels

## Related Files
- `src/auth/guards/roles.guard.ts` - Reference implementation
- `src/auth/decorators/roles.decorator.ts` - Reference implementation
- `src/user/user.service.ts` - Contains `userHasMinLevel` helper
- `src/auth/guards/bearer-token.guard.ts` - Must run first
- `prisma/schema.prisma` - Role model definition
