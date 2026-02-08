# MinUserLevel Guard Documentation

## Overview
The `@MinUserLevel()` decorator and `MinUserLevelGuard` provide role-based access control based on user role levels. This is useful when you need hierarchical permission checks where lower level numbers represent higher privileges.

## Key Concepts

### Role Level Hierarchy
- **Lower level = Higher privilege** (e.g., level 10 > level 50 > level 100)
- Level 10 (super admin) can access all endpoints
- Level 50 (admin) can access level 50+ endpoints
- Level 100 (user) can only access level 100 endpoints

### Multiple Roles
- If a user has multiple roles, only ONE needs to meet the minimum level requirement
- The guard checks if ANY of the user's roles has a level <= the required minimum

## Installation

The guard and decorator are already available in the `AuthEndpointsModule`. Simply import them:

```typescript
import { MinUserLevel } from '../auth/decorators/min-user-level.decorator';
import { MinUserLevelGuard } from '../auth/guards/min-user-level.guard';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
```

## Usage

### Controller-Level Protection

Apply the decorator at the class level to protect all routes in the controller:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { MinUserLevelGuard } from '../auth/guards/min-user-level.guard';
import { MinUserLevel } from '../auth/decorators/min-user-level.decorator';

@Controller('admin')
@UseGuards(BearerTokenGuard, MinUserLevelGuard)
@MinUserLevel(50)  // All routes require level <= 50
export class AdminController {
  @Get('users')
  async listUsers() {
    // Only users with role level <= 50 can access
    return { users: [] };
  }

  @Get('settings')
  async getSettings() {
    // Also requires level <= 50 (from controller)
    return { settings: {} };
  }
}
```

### Route-Level Protection

Apply the decorator to specific routes:

```typescript
@Controller('api')
@UseGuards(BearerTokenGuard, MinUserLevelGuard)
export class ApiController {
  @Get('public')
  async getPublicData() {
    // No level requirement - all authenticated users allowed
    return { data: 'public' };
  }

  @Get('admin')
  @MinUserLevel(50)
  async getAdminData() {
    // Only users with role level <= 50 can access
    return { data: 'admin-only' };
  }

  @Get('super-admin')
  @MinUserLevel(10)
  async getSuperAdminData() {
    // Only users with role level <= 10 can access
    return { data: 'super-admin-only' };
  }
}
```

### Method Override

Method-level decorators override class-level decorators:

```typescript
@Controller('admin')
@UseGuards(BearerTokenGuard, MinUserLevelGuard)
@MinUserLevel(50)  // Default: requires level <= 50
export class AdminController {
  @Get('users')
  async listUsers() {
    // Uses class-level: requires level <= 50
  }

  @Get('critical-action')
  @MinUserLevel(10)  // Override: requires level <= 10
  async criticalAction() {
    // Only super admins (level <= 10) can access
  }

  @Get('relaxed-action')
  @MinUserLevel(100)  // Override: relaxed to level <= 100
  async relaxedAction() {
    // All authenticated users can access
  }
}
```

## Guard Order (CRITICAL)

**ALWAYS place `BearerTokenGuard` before `MinUserLevelGuard`:**

```typescript
// ✅ CORRECT
@UseGuards(BearerTokenGuard, MinUserLevelGuard)
@MinUserLevel(50)
export class AdminController {}

// ❌ WRONG - MinUserLevelGuard needs user from BearerTokenGuard
@UseGuards(MinUserLevelGuard, BearerTokenGuard)
@MinUserLevel(50)
export class AdminController {}
```

The `BearerTokenGuard` attaches the authenticated user to the request, which the `MinUserLevelGuard` then uses for validation.

## Error Responses

### 401 Unauthorized
When user is not authenticated (no valid Bearer token):

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### 403 Forbidden
When user is authenticated but has insufficient role level:

```json
{
  "statusCode": 403,
  "message": "Insufficient permissions. Minimum role level required: 50",
  "error": "Forbidden"
}
```

## How It Differs from RolesGuard

| Feature | `@Roles()` | `@MinUserLevel()` |
|---------|------------|-------------------|
| **Check Type** | Exact role slug match | Hierarchical level comparison |
| **Example** | `@Roles('admin', 'moderator')` | `@MinUserLevel(50)` |
| **Logic** | User must have ONE of the specified roles | User must have ANY role with level <= X |
| **Use Case** | Specific role names | Hierarchical permissions |
| **Flexibility** | Less flexible (hardcoded slugs) | More flexible (numeric levels) |

### When to Use Which

- **Use `@Roles()`** when you need specific, named roles (e.g., "content-creator", "moderator")
- **Use `@MinUserLevel()`** when you have a clear privilege hierarchy (e.g., admin levels)
- **Use both** when you need combination of both strategies

## Best Practices

### 1. Define Clear Level Ranges
```typescript
// Good - clear hierarchy
const ROLE_LEVELS = {
  SUPER_ADMIN: 10,
  ADMIN: 50,
  MODERATOR: 75,
  USER: 100,
};

@MinUserLevel(ROLE_LEVELS.ADMIN)
```

### 2. Don't Hardcode Levels
```typescript
// ❌ Bad
@MinUserLevel(50)

// ✅ Good
import { ADMIN_LEVEL } from '../constants/role-levels';
@MinUserLevel(ADMIN_LEVEL)
```

### 3. Document Level Requirements
```typescript
/**
 * Delete user endpoint
 * @access Admin only (level <= 50)
 */
@MinUserLevel(50)
@Delete('users/:id')
async deleteUser() {}
```

### 4. Use Environment Variables for Flexible Configuration
```typescript
const ADMIN_LEVEL = parseInt(process.env.ADMIN_ROLE_LEVEL || '50');

@MinUserLevel(ADMIN_LEVEL)
```

### 5. Combine with Other Guards When Needed
```typescript
@UseGuards(BearerTokenGuard, MinUserLevelGuard, AuditGuard)
@MinUserLevel(10)
@Post('critical-action')
async criticalAction() {}
```

## Troubleshooting

### Issue: "User not authenticated" error
**Cause**: `BearerTokenGuard` is not running or is placed after `MinUserLevelGuard`

**Solution**: Ensure guards are in correct order:
```typescript
@UseGuards(BearerTokenGuard, MinUserLevelGuard)  // ✅ Correct order
```

### Issue: Users with higher level can access restricted endpoints
**Cause**: Level comparison might be inverted in your mind

**Remember**: Lower level = Higher privilege
- Level 10 can access level 50 endpoints
- Level 50 CANNOT access level 10 endpoints

### Issue: User has correct level but still gets 403
**Possible Causes**:
1. User roles not included in token
2. Role level not set correctly in database
3. Multiple role conditions interfering

**Debug Steps**:
```typescript
@Get('debug')
async debugRoles(@CurrentUser() user: ITokenUser) {
  return {
    userId: user.id,
    roles: user.roles.map(r => ({ slug: r.slug, level: r.level })),
    maxLevel: Math.max(...user.roles.map(r => r.level)),
    minLevel: Math.min(...user.roles.map(r => r.level)),
  };
}
```

### Issue: Tests failing with "gates.map is not a function"
**Cause**: User object doesn't include `gates` relation

**Solution**: Include gates when querying users:
```typescript
await prisma.user.findUnique({
  where: { id },
  include: {
    roles: { include: { role: true } },
    gates: { include: { gate: true } },  // ✅ Include gates
  },
});
```

## Example: Complete Admin Module

```typescript
import { Controller, Get, Post, Delete, UseGuards, Param } from '@nestjs/common';
import { BearerTokenGuard } from '../auth/guards/bearer-token.guard';
import { MinUserLevelGuard } from '../auth/guards/min-user-level.guard';
import { MinUserLevel } from '../auth/decorators/min-user-level.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ITokenUser } from '../auth/services/token.service';

// Define level constants
const SUPER_ADMIN_LEVEL = 10;
const ADMIN_LEVEL = 50;

@Controller('admin')
@UseGuards(BearerTokenGuard, MinUserLevelGuard)
@MinUserLevel(ADMIN_LEVEL)  // Default admin access
export class AdminController {
  /**
   * List all users
   * @access Admin (level <= 50)
   */
  @Get('users')
  async listUsers() {
    return { users: [] };
  }

  /**
   * Get system logs
   * @access Super Admin (level <= 10)
   */
  @Get('logs')
  @MinUserLevel(SUPER_ADMIN_LEVEL)
  async getLogs() {
    return { logs: [] };
  }

  /**
   * Delete user (critical action)
   * @access Super Admin (level <= 10)
   */
  @Delete('users/:id')
  @MinUserLevel(SUPER_ADMIN_LEVEL)
  async deleteUser(@Param('id') id: string) {
    return { deleted: true };
  }

  /**
   * Get current admin info
   * @access Any admin (level <= 50)
   */
  @Get('me')
  async getMe(@CurrentUser() user: ITokenUser) {
    return {
      id: user.id,
      email: user.email,
      roles: user.roles,
      maxLevel: Math.max(...user.roles.map(r => r.level)),
    };
  }
}
```

## Testing

### Unit Test Example
```typescript
it('should allow user with sufficient level', () => {
  const mockUser = {
    id: 1,
    roles: [{ slug: 'admin', level: 50 }],
  };

  jest.spyOn(reflector, 'getAllAndOverride')
    .mockReturnValueOnce(false)  // not anonymous
    .mockReturnValueOnce(50);     // min level

  jest.spyOn(UserService, 'userHasMinLevel').mockReturnValue(true);

  const context = createMockContext(mockUser);
  expect(guard.canActivate(context)).toBe(true);
});
```

### Integration Test Example
```typescript
it('should deny regular user from admin endpoint', () => {
  return request(app.getHttpServer())
    .get('/admin/users')
    .set('Authorization', `Bearer ${userToken}`)  // level 100
    .expect(403)
    .expect((res) => {
      expect(res.body.message).toContain('Minimum role level required: 50');
    });
});
```

## Performance Considerations

- **No database queries**: The guard uses the user object already attached to the request by `BearerTokenGuard`
- **Minimal overhead**: Simple numeric comparison (< 1ms)
- **Memory efficient**: Metadata is cached by NestJS Reflector

## Security Notes

1. **Always validate on backend**: Never rely solely on frontend role checks
2. **Use HTTPS**: Tokens should never be transmitted over HTTP
3. **Regular audits**: Log and monitor access to restricted endpoints
4. **Principle of least privilege**: Assign the minimum necessary level

## Related Documentation

- [BearerTokenGuard](./BEARER_TOKEN_SETUP.md) - Authentication guard
- [RolesGuard](./roles.guard.ts) - Role-based access control
- [User Service](../../user/user.service.ts) - User and role management
- [BEARER_TOKEN_QUICKSTART.md](../../BEARER_TOKEN_QUICKSTART.md) - Quick start guide

## Changelog

- **v1.0.0** (2026-02-08): Initial implementation
  - `@MinUserLevel()` decorator
  - `MinUserLevelGuard`
  - Full test coverage (unit + integration)
  - Documentation
