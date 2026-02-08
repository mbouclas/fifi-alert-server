# Bearer Token Authentication - Quick Start Guide

## 🚀 What Was Implemented

JWT bearer token authentication alongside existing better-auth session cookies. Now supports:

- ✅ JWT access tokens (short-lived, 15min)
- ✅ JWT refresh tokens (long-lived, 7d)
- ✅ Token storage in database for revocation
- ✅ Role-based access control with `@Roles()` decorator
- ✅ Gates (feature flags) returned with user data
- ✅ Dual auth: cookies OR bearer tokens
- ✅ Banned user checking
- ✅ Token refresh endpoint

## 📦 Files Created/Modified

### New Files
```
src/auth/
  ├── services/
  │   └── token.service.ts          # JWT token generation/validation
  ├── guards/
  │   ├── bearer-token.guard.ts     # Validates Authorization header
  │   └── roles.guard.ts            # Enforces role checks
  ├── decorators/
  │   ├── allow-anonymous.decorator.ts  # Public routes
  │   ├── current-user.decorator.ts     # Extract user from request
  │   └── roles.decorator.ts            # Specify required roles
  ├── examples/
  │   └── example.controller.ts     # Usage examples
  └── index.ts                      # Barrel exports

docs/
  └── BEARER_TOKEN_SETUP.md         # Detailed setup guide
```

### Modified Files
```
prisma/schema.prisma                # Added UserGate, banned fields, session enhancements
src/auth/auth.module.ts             # Registered JwtModule and providers
src/auth/auth/auth.controller.ts   # Added JWT token generation, refresh endpoint
src/auth/dto/auth.dto.ts            # Added JWT fields, Gate DTOs
src/shared/helpers/prisma-include.helper.ts  # Added gates include support
.env.example                        # Added JWT configuration
```

## 🔧 Quick Setup

### 1. Set Environment Variables

Add to your `.env`:

```bash
JWT_SECRET=<your-secret-64-chars-min>
JWT_REFRESH_SECRET=<your-refresh-secret-64-chars-min>
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
```

Generate secrets:
```bash
# PowerShell
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 2. Run Migration

```bash
bunx prisma migrate dev --name add_bearer_token_support
bunx prisma generate
```

### 3. Test It

#### Login (get tokens)
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'
```

Response:
```json
{
  "message": "Login successful",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "expiresAt": "2026-02-04T12:15:00Z"
}
```

#### Use Bearer Token
```bash
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer <your-access-token>"
```

Response:
```json
{
  "id": 1,
  "email": "user@example.com",
  "roles": [
    {
      "id": 1,
      "role": {
        "slug": "user",
        "name": "User",
        "level": 100
      }
    }
  ],
  "gates": [
    {
      "id": 1,
      "gate": {
        "slug": "premium-features",
        "name": "Premium Features",
        "active": true
      }
    }
  ]
}
```

#### Refresh Token
```bash
curl -X POST http://localhost:3000/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<your-refresh-token>"}'
```

## 💡 Usage Examples

### Protect Routes with Bearer Token

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { BearerTokenGuard, CurrentUser, type ITokenUser } from './auth';

@Controller('api')
export class MyController {
  @Get('data')
  @UseGuards(BearerTokenGuard)
  async getData(@CurrentUser() user: ITokenUser) {
    return { data: 'protected', user };
  }
}
```

### Require Specific Roles

```typescript
import { BearerTokenGuard, RolesGuard, Roles } from './auth';

@Get('admin')
@UseGuards(BearerTokenGuard, RolesGuard)
@Roles('admin')
async adminOnly(@CurrentUser() user: ITokenUser) {
  return { message: 'Admin only' };
}
```

### Require Minimum Role Level (Hierarchical)

```typescript
import { BearerTokenGuard, MinUserLevelGuard, MinUserLevel } from './auth';

@Get('admin/settings')
@UseGuards(BearerTokenGuard, MinUserLevelGuard)
@MinUserLevel(50)  // Lower = higher privilege (10 > 50 > 100)
async adminSettings(@CurrentUser() user: ITokenUser) {
  return { message: 'Admin settings (level <= 50)' };
}

// Controller-level protection
@Controller('super-admin')
@UseGuards(BearerTokenGuard, MinUserLevelGuard)
@MinUserLevel(10)  // All routes require level <= 10
export class SuperAdminController {
  @Get('critical')
  async criticalAction() {
    return { message: 'Super admin only (level <= 10)' };
  }
  
  @Get('stats')
  @MinUserLevel(50)  // Override: relax to level <= 50
  async getStats() {
    return { message: 'Any admin can view stats' };
  }
}
```

### Check Feature Gates

```typescript
@Get('feature')
@UseGuards(BearerTokenGuard)
async premiumFeature(@CurrentUser() user: ITokenUser) {
  const hasGate = user.gates.some(g => g.slug === 'premium' && g.active);
  
  if (!hasGate) {
    throw new ForbiddenException('Premium feature required');
  }
  
  return { feature: 'premium data' };
}
```

### Make Routes Public

```typescript
import { AllowAnonymous } from './auth';

@Post('login')
@AllowAnonymous()
async login(@Body() dto: LoginDto) {
  // Public route, no authentication
}
```

## 🔐 Apply Guard Globally (Optional)

To protect all routes by default:

```typescript
// app.module.ts
import { APP_GUARD } from '@nestjs/core';
import { BearerTokenGuard } from './auth/guards/bearer-token.guard';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: BearerTokenGuard,
    },
  ],
})
export class AppModule {}
```

Then use `@AllowAnonymous()` on public routes like login/signup.

## 🎯 Managing Gates (Feature Flags)

### Create a Gate

```typescript
await prisma.gate.create({
  data: {
    name: 'Beta Features',
    slug: 'beta-features',
    active: true,
  },
});
```

### Assign Gate to User

```typescript
await prisma.userGate.create({
  data: {
    user_id: userId,
    gate_id: gateId,
  },
});
```

### Client-Side Check

```typescript
// Frontend
const user = await fetch('/auth/me').then(r => r.json());

const hasBetaAccess = user.gates.some(
  ug => ug.gate.slug === 'beta-features' && ug.gate.active
);

if (hasBetaAccess) {
  showBetaFeatures();
}
```

## 🛡️ Token Revocation

### Revoke Single Token

```typescript
import { TokenService } from './auth';

// In controller or service
constructor(private tokenService: TokenService) {}

async logout() {
  await this.tokenService.revokeToken(token);
}
```

### Revoke All User Tokens (Force Logout)

```typescript
async logoutAllDevices(userId: number) {
  const count = await this.tokenService.revokeAllUserTokens(userId);
  return { message: `Revoked ${count} tokens` };
}
```

### Cleanup Expired Tokens (Cron Job)

```typescript
import { Cron, CronExpression } from '@nestjs/schedule';

@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async cleanupTokens() {
  const deleted = await this.tokenService.cleanupExpiredTokens();
  this.logger.log(`Cleaned up ${deleted} expired tokens`);
}
```

## 🎓 Key Concepts

### Role Hierarchy

Roles have a `level` field:
- **Lower level = Higher privilege** (e.g., admin = 10, user = 100)
- If user has multiple roles, ANY role can satisfy `@Roles()` check
- No automatic inheritance - specify all required roles explicitly

### Gates vs Roles

- **Roles**: Permanent user permissions based on job function (admin, moderator, user)
- **Gates**: Temporary feature flags independent of role (premium-features, beta-access)

Use cases:
- **Roles**: "Only admins can delete users"
- **Gates**: "Users with premium gate can access advanced search"

### Token Lifecycle

1. **Login/Signup**: Returns access + refresh tokens
2. **API Request**: Send `Authorization: Bearer <access-token>`
3. **Token Expires**: Use refresh token to get new access token
4. **Refresh Expires**: User must login again
5. **Logout**: Revoke tokens in database

## 📚 Full Documentation

For detailed information, see:
- [`docs/BEARER_TOKEN_SETUP.md`](./BEARER_TOKEN_SETUP.md) - Complete setup guide
- [`src/auth/examples/example.controller.ts`](../src/auth/examples/example.controller.ts) - Usage examples

## ⚠️ Important Notes

1. **Database Required**: Run migration before testing
2. **Strong Secrets**: Use min 64-char random secrets in production
3. **HTTPS Only**: Always use HTTPS in production
4. **Token Storage**: Store tokens securely (not in localStorage on web)
5. **Dual Auth**: Both cookies AND bearer tokens work simultaneously

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Invalid token" | Check JWT_SECRET in .env matches |
| "User not authenticated" | Verify Authorization header format: `Bearer <token>` |
| Gates not showing | Ensure UserGate records exist and gate is active |
| Migration fails | Check database is running and .env has correct DATABASE_URL |

## ✅ Next Steps

1. ✅ Run migration
2. ✅ Test login endpoint
3. ✅ Test protected routes with bearer token
4. ✅ Create some gates in database
5. ✅ Test role-based access control
6. Consider implementing admin API for gate/user management

---

**Status**: Implementation Complete ✨  
**Ready For**: Database migration and testing  
**Documentation**: See `docs/BEARER_TOKEN_SETUP.md` for details
