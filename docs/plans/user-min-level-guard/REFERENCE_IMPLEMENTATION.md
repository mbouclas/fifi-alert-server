# MinUserLevel Guard - Reference Implementation

## Code Patterns to Follow

This document provides reference code patterns based on the existing `RolesGuard` implementation.

---

## 1. Decorator Pattern

**Reference**: `src/auth/decorators/roles.decorator.ts`

```typescript
import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for min user level decorator
 */
export const MIN_USER_LEVEL_KEY = 'minUserLevel';

/**
 * Decorator to specify minimum required role level for a route or controller
 * Used in conjunction with MinUserLevelGuard
 * 
 * Lower level numbers = higher privileges (e.g., level 10 is more privileged than level 50)
 * If user has multiple roles, only ONE needs to meet the minimum level requirement
 *
 * @param level - The minimum role level required (lower = higher privilege)
 * 
 * @example
 * ```typescript
 * // Controller level - all routes require level <= 50
 * @MinUserLevel(50)
 * @Controller('admin')
 * export class AdminController { ... }
 * 
 * // Route level - specific route requires level <= 10
 * @MinUserLevel(10)
 * @Get('super-admin/settings')
 * async getSettings() {
 *   // Only users with role level <= 10 can access this
 * }
 * ```
 */
export const MinUserLevel = (level: number) => SetMetadata(MIN_USER_LEVEL_KEY, level);
```

---

## 2. Guard Pattern

**Reference**: `src/auth/guards/roles.guard.ts`

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MIN_USER_LEVEL_KEY } from '../decorators/min-user-level.decorator';
import { ALLOW_ANONYMOUS_KEY } from '../decorators/allow-anonymous.decorator';
import { UserService } from '../../user/user.service';
import type { ITokenUser } from '../services/token.service';

/**
 * Guard that checks if the authenticated user has a role with at least the minimum level
 * Must be used after BearerTokenGuard (which attaches user to request)
 *
 * Level hierarchy: lower level = higher privileges (e.g., 10 > 50)
 * If a user has multiple roles, only ONE needs to meet the minimum level
 *
 * @example
 * ```typescript
 * @UseGuards(BearerTokenGuard, MinUserLevelGuard)
 * @MinUserLevel(50)
 * @Get('admin/users')
 * async listUsers() {
 *   // Only users with role level <= 50 can access this
 * }
 * ```
 */
@Injectable()
export class MinUserLevelGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if route is marked as anonymous
    const isAnonymous = this.reflector.getAllAndOverride<boolean>(
      ALLOW_ANONYMOUS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isAnonymous) {
      return true;
    }

    // Get minimum required level from @MinUserLevel() decorator
    // getAllAndOverride checks method first, then class (method overrides class)
    const minLevel = this.reflector.getAllAndOverride<number>(
      MIN_USER_LEVEL_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no minimum level is specified, allow access
    if (minLevel === undefined || minLevel === null) {
      return true;
    }

    // Get user from request (attached by BearerTokenGuard)
    const request = context.switchToHttp().getRequest();
    const user: ITokenUser = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Check if user has at least one role with the minimum level
    // Note: The ITokenUser from token already includes roles array
    const hasMinLevel = UserService.userHasMinLevel(user, minLevel);

    if (!hasMinLevel) {
      throw new ForbiddenException(
        `Insufficient permissions. Minimum role level required: ${minLevel}`,
      );
    }

    return true;
  }
}
```

---

## 3. Usage Pattern

### Controller Level
```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { MinUserLevelGuard } from '../auth/guards/min-user-level.guard';
import { MinUserLevel } from '../auth/decorators/min-user-level.decorator';

@Controller('admin')
@UseGuards(BearerTokenGuard, MinUserLevelGuard)
@MinUserLevel(50)  // All routes in this controller require level <= 50
export class AdminController {
  @Get('users')
  async listUsers() {
    // Requires level <= 50 (from controller)
  }

  @Get('settings')
  @MinUserLevel(10)  // Override: this route requires level <= 10
  async getSettings() {
    // Requires level <= 10 (overrides controller level)
  }
}
```

### Route Level Only
```typescript
@Controller('api')
@UseGuards(BearerTokenGuard, MinUserLevelGuard)
export class ApiController {
  @Get('public')
  async getPublicData() {
    // No level requirement
  }

  @Get('admin')
  @MinUserLevel(50)
  async getAdminData() {
    // Requires level <= 50
  }
}
```

---

## 4. Test Pattern

### Unit Test Structure
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MinUserLevelGuard } from '../min-user-level.guard';
import { MIN_USER_LEVEL_KEY } from '../../decorators/min-user-level.decorator';
import { ALLOW_ANONYMOUS_KEY } from '../../decorators/allow-anonymous.decorator';

describe('MinUserLevelGuard', () => {
  let guard: MinUserLevelGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MinUserLevelGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<MinUserLevelGuard>(MinUserLevelGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  const createMockContext = (user?: any): ExecutionContext => ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as any);

  describe('when no min level is specified', () => {
    it('should allow access', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      const context = createMockContext();
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('when route is anonymous', () => {
    it('should allow access', () => {
      jest.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(true);  // isAnonymous
      const context = createMockContext();
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('when user has sufficient level', () => {
    it('should allow access', () => {
      const mockUser = {
        id: 1,
        roles: [{ slug: 'admin', level: 10 }],
      };
      
      jest.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(false)  // not anonymous
        .mockReturnValueOnce(50);     // min level = 50
      
      const context = createMockContext(mockUser);
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('when user has insufficient level', () => {
    it('should throw ForbiddenException', () => {
      const mockUser = {
        id: 1,
        roles: [{ slug: 'user', level: 100 }],
      };
      
      jest.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(false)  // not anonymous
        .mockReturnValueOnce(50);     // min level = 50
      
      const context = createMockContext(mockUser);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('when user is not authenticated', () => {
    it('should throw ForbiddenException', () => {
      jest.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(false)  // not anonymous
        .mockReturnValueOnce(50);     // min level = 50
      
      const context = createMockContext(); // no user
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
```

---

## 5. Integration Test Pattern

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('MinUserLevelGuard (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;  // User with level 10
  let userToken: string;   // User with level 100

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // TODO: Create test users and get tokens
    // adminToken = await createTestUserAndGetToken({ level: 10 });
    // userToken = await createTestUserAndGetToken({ level: 100 });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /admin/settings (requires level <= 50)', () => {
    it('should allow admin user (level 10)', () => {
      return request(app.getHttpServer())
        .get('/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should deny regular user (level 100)', () => {
      return request(app.getHttpServer())
        .get('/admin/settings')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403)
        .expect((res) => {
          expect(res.body.message).toContain('Minimum role level required: 50');
        });
    });

    it('should deny unauthenticated request', () => {
      return request(app.getHttpServer())
        .get('/admin/settings')
        .expect(401);  // BearerTokenGuard fails first
    });
  });
});
```

---

## Key Implementation Notes

### 1. Reflector Usage
- Use `getAllAndOverride` (not `get`) to handle inheritance
- Check method first, then class (automatic with `getAllAndOverride`)
- Pass `[context.getHandler(), context.getClass()]` as second argument

### 2. User Object
- User is attached to request by `BearerTokenGuard`
- Type is `ITokenUser` which includes roles array
- Each role has `slug` and `level` properties

### 3. Level Semantics
- **Lower number = higher privilege**
- Level 10 can access level 50 endpoints
- Level 50 CANNOT access level 10 endpoints

### 4. Multiple Roles
- User can have multiple roles
- Only ONE role needs to meet the minimum level
- Use `UserService.userHasMinLevel()` helper (uses `.some()`)

### 5. Guard Order
```typescript
// CORRECT
@UseGuards(BearerTokenGuard, MinUserLevelGuard)

// WRONG - MinUserLevel needs user from BearerToken
@UseGuards(MinUserLevelGuard, BearerTokenGuard)
```

### 6. Error Messages
- Not authenticated: `"User not authenticated"`
- Insufficient level: `"Insufficient permissions. Minimum role level required: {X}"`
- Always include the required level in error message for debugging

---

## Files to Create

1. `src/auth/decorators/min-user-level.decorator.ts`
2. `src/auth/guards/min-user-level.guard.ts`
3. `src/auth/decorators/__tests__/min-user-level.decorator.spec.ts`
4. `src/auth/guards/__tests__/min-user-level.guard.spec.ts`
5. `test/min-user-level-guard.e2e-spec.ts`
6. `docs/modules/auth/MIN_USER_LEVEL_GUARD.md`

---

## Critical Checklist

- [ ] Use `MIN_USER_LEVEL_KEY` constant (not magic string)
- [ ] Check `ALLOW_ANONYMOUS_KEY` first
- [ ] Use `getAllAndOverride` (not `get`)
- [ ] Use `UserService.userHasMinLevel()` helper
- [ ] Throw `ForbiddenException` (not `UnauthorizedException`)
- [ ] Include level in error message
- [ ] Add JSDoc comments with examples
- [ ] Follow TypeScript strict mode
- [ ] No hardcoded values
- [ ] Proper dependency injection

---

## Related Resources
- [NestJS Guards Documentation](https://docs.nestjs.com/guards)
- [NestJS Custom Decorators](https://docs.nestjs.com/custom-decorators)
- Existing Implementation: `src/auth/guards/roles.guard.ts`
- Existing Pattern: `src/auth/decorators/roles.decorator.ts`
