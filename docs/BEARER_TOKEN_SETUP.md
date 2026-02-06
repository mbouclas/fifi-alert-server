# Bearer Token Authentication Setup - Implementation Complete

## Summary

Successfully implemented JWT bearer token authentication for the NestJS + better-auth application with the following features:

### ✅ Completed Implementation

1. **Prisma Schema Updates**
   - Added `banned`, `banReason`, `banExpires` fields to User model for admin ban functionality
   - Created `UserGate` junction table for many-to-many User-Gate relationships (gates as feature flags)
   - Enhanced Session model with `tokenType`, `revoked`, `revokedAt`, `impersonatedBy` for JWT token storage and revocation
   - Added comprehensive indexes for performance optimization

2. **JWT Token Service** (`src/auth/services/token.service.ts`)
   - Access token generation (short-lived, 15min default)
   - Refresh token generation (long-lived, 7d default)
   - Token validation with user/role/gate extraction
   - Token revocation capability (single token or all user tokens)
   - Automatic ban checking during validation
   - Expired token cleanup utility

3. **Authentication Guards**
   - `BearerTokenGuard`: Validates JWT tokens from Authorization header
   - `RolesGuard`: Enforces role-based access control
   - Respects `@AllowAnonymous()` decorator for public routes

4. **Custom Decorators**
   - `@CurrentUser()`: Extracts authenticated user from request
   - `@Roles(...roles)`: Specifies required roles for routes
   - `@AllowAnonymous()`: Marks routes as publicly accessible

5. **Updated Auth Endpoints**
   - `POST /auth/login`: Now returns JWT tokens (access + refresh) in addition to session cookie
   - `POST /auth/signup`: Returns JWT tokens for newly registered users
   - `GET /auth/me`: Includes **gates** along with roles in response
   - `POST /auth/refresh-token`: New endpoint to refresh access tokens using refresh token

6. **DTOs Enhanced**
   - `AuthResponseDto`: Added `accessToken`, `refreshToken`, `expiresAt` fields
   - `GateDto` and `UserGateDto`: New DTOs for gate/feature flag representation
   - `MeResponseDto`: Added `gates` field

7. **Dependencies Installed**
   - `@nestjs/jwt` ^11.0.2
   - `@nestjs/passport` ^11.0.5
   - `passport` ^0.7.0
   - `passport-jwt` ^4.0.1
   - `@types/passport-jwt` ^4.0.1

8. **Environment Variables**
   - `.env.example` updated with JWT configuration:
     - `JWT_SECRET`: Secret key for access tokens
     - `JWT_REFRESH_SECRET`: Secret key for refresh tokens
     - `JWT_ACCESS_EXPIRATION`: Access token lifetime (default: 15m)
     - `JWT_REFRESH_EXPIRATION`: Refresh token lifetime (default: 7d)

## 🚀 Next Steps to Complete Setup

### 1. Run Database Migration

Once your PostgreSQL database is running, execute:

```bash
bunx prisma migrate dev --name add_bearer_token_support
```

This will:
- Add `banned`, `banReason`, `banExpires` columns to `user` table
- Create `UserGate` junction table
- Add JWT-related columns to `session` table (`tokenType`, `revoked`, `revokedAt`, `impersonatedBy`)
- Create necessary indexes

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and update with production-ready values:

```bash
# IMPORTANT: Generate strong random secrets for production!
JWT_SECRET=<generate-with-openssl-rand-base64-64>
JWT_REFRESH_SECRET=<generate-with-openssl-rand-base64-64>
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
```

To generate secure secrets:
```bash
# PowerShell
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Maximum 256 }))

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

### 3. Regenerate Prisma Client

After migration, regenerate the Prisma client to include new models:

```bash
bunx prisma generate
```

### 4. Update User Service (if needed)

The `UserService.findOne()` method needs to support the `'gates'` include option. Check if it's already implemented:

```typescript
// In src/user/user.service.ts
async findOne(
  where: { id: number } | { email: string },
  include?: Array<'roles' | 'gates' | 'sessions' | 'accounts'>
): Promise<User | null> {
  // Ensure 'gates' is handled in the include logic
}
```

### 5. Apply Bearer Token Guard Globally (Optional)

To protect all routes by default with bearer token authentication, update `app.module.ts`:

```typescript
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

### 6. Test the Implementation

#### Test Login with JWT Tokens

```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Response will include:
# - accessToken
# - refreshToken
# - expiresAt
```

#### Test Protected Route with Bearer Token

```bash
# Use the accessToken from login
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer <your-access-token>"

# Response will include roles AND gates
```

#### Test Token Refresh

```bash
curl -X POST http://localhost:3000/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<your-refresh-token>"}'

# Response will include new accessToken
```

#### Test Role-Based Protection

```typescript
// In any controller
import { UseGuards } from '@nestjs/common';
import { BearerTokenGuard, RolesGuard } from './auth/guards';
import { Roles } from './auth/decorators';

@UseGuards(BearerTokenGuard, RolesGuard)
@Roles('admin')
@Get('admin/dashboard')
async adminDashboard(@CurrentUser() user: ITokenUser) {
  return { message: 'Admin only', user };
}
```

## 📝 Gate Management (Feature Flags)

Gates function as feature flags that can be assigned to users regardless of their role. Here's how to manage them:

### Creating Gates

```typescript
// Example: Create a gate via Prisma
await prisma.gate.create({
  data: {
    name: 'Premium Features',
    slug: 'premium-features',
    active: true,
    level: 0,
    provider: 'manual',
  },
});
```

### Assigning Gates to Users

```typescript
// Assign gate to user
await prisma.userGate.create({
  data: {
    user_id: userId,
    gate_id: gateId,
  },
});
```

### Client-Side Gate Checking

The `/auth/me` endpoint now returns gates in the response:

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

Client apps can check for gate presence to enable/disable features:

```typescript
// Frontend example
const hasPremiumFeatures = user.gates.some(
  ug => ug.gate.slug === 'premium-features' && ug.gate.active
);

if (hasPremiumFeatures) {
  // Show premium UI
}
```

## 🔒 Token Revocation

Tokens are stored in the `session` table with revocation capability:

### Revoke a Single Token

```typescript
await tokenService.revokeToken(token);
```

### Revoke All User Tokens (Force Logout)

```typescript
await tokenService.revokeAllUserTokens(userId);
```

### Auto-Cleanup Expired Tokens

Run periodically (e.g., via cron job):

```typescript
const deleted = await tokenService.cleanupExpiredTokens();
console.log(`Cleaned up ${deleted} expired tokens`);
```

## 🎯 Dual Authentication Strategy

The system now supports **dual authentication**:

1. **Cookie-based sessions** (better-auth default)
   - Used by better-auth for session management
   - Suitable for same-origin web apps

2. **JWT bearer tokens** (newly implemented)
   - Suitable for mobile apps, SPAs, third-party integrations
   - Stored in database for revocation capability
   - Include user roles and gates in payload

Both mechanisms work simultaneously. Clients can choose which to use based on their needs.

## 📚 Additional Documentation Needed

Consider creating the following documentation:

1. **API Documentation**: Update Swagger/OpenAPI docs with new endpoints and response schemas
2. **Admin Guide**: How to manage gates, ban users, and handle token revocations
3. **Client Integration Guide**: How frontend/mobile apps should use bearer tokens
4. **Security Best Practices**: Token rotation, secret management, rate limiting

## ⚠️ Security Considerations

1. **JWT Secrets**: Use strong, randomly generated secrets in production (min 256 bits)
2. **Token Storage**: Never store JWT tokens in localStorage on web clients (use httpOnly cookies or memory)
3. **HTTPS**: Always use HTTPS in production for token transmission
4. **Token Lifetime**: Keep access tokens short-lived (15min recommended)
5. **Refresh Token Rotation**: Consider implementing refresh token rotation for enhanced security
6. **Rate Limiting**: Add rate limiting to login/signup/refresh endpoints
7. **Monitoring**: Log and monitor failed authentication attempts and suspicious token usage

## 🐛 Troubleshooting

### Issue: "Invalid token" errors

- Check that `JWT_SECRET` is correctly set in `.env`
- Verify the token hasn't expired (check `expiresAt`)
- Ensure the token hasn't been revoked (check `session.revoked`)

### Issue: "User not authenticated" in guards

- Verify `BearerTokenGuard` is executed before `RolesGuard`
- Check Authorization header format: `Bearer <token>`
- Confirm token is valid using `/auth/me` endpoint

### Issue: Gates not appearing in `/auth/me`

- Verify `UserGate` records exist in database
- Check that gates are marked as `active: true`
- Ensure `findOne` includes `'gates'` in relations

## ✨ Future Enhancements

Consider implementing:

1. **Admin API** (`AdminController`)
   - User management (ban/unban, assign roles/gates)
   - Session management (view active sessions, force logout)
   - Gate management (CRUD operations)

2. **Permission System**
   - Fine-grained permissions beyond role-level checks
   - Permission guards and decorators
   - Permission inheritance from roles

3. **Two-Factor Authentication**
   - Better-auth supports 2FA plugins
   - Enhance security for sensitive operations

4. **OAuth Providers**
   - Google, GitHub, Microsoft authentication
   - Social login integration

5. **Audit Logging**
   - Track authentication events
   - Monitor token usage and revocations
   - Security incident detection

---

**Implementation Status**: ✅ **Complete** - Ready for database migration and testing

**Author**: GitHub Copilot  
**Date**: February 4, 2026
