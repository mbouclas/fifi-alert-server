# Troubleshooting Guide

## Overview

This guide helps you diagnose and resolve common issues with the JWT bearer token authentication system.

---

## Table of Contents

1. [Authentication Issues](#authentication-issues)
2. [Token Issues](#token-issues)
3. [Permission Issues](#permission-issues)
4. [Database Issues](#database-issues)
5. [Rate Limiting Issues](#rate-limiting-issues)
6. [Gate Issues](#gate-issues)
7. [Server Issues](#server-issues)
8. [Common Error Messages](#common-error-messages)
9. [Debugging Tools](#debugging-tools)
10. [Getting Help](#getting-help)

---

## Authentication Issues

### Problem: Cannot Login - "Invalid credentials"

**Symptoms:**
- POST /auth/login returns 401
- Error message: "Invalid credentials"

**Causes:**
1. Incorrect email or password
2. User account doesn't exist
3. Password hashing mismatch

**Solutions:**

```bash
# 1. Verify user exists
curl -X GET http://localhost:3000/users \
  -H "Authorization: Bearer ADMIN_TOKEN" | grep "user@example.com"

# 2. Reset password via admin
curl -X PUT http://localhost:3000/users/:id \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password": "newpassword123"}'

# 3. Check database directly
psql -U postgres -d fifi -c "SELECT id, email FROM \"user\" WHERE email='user@example.com';"
```

### Problem: "User is banned"

**Symptoms:**
- Login returns 423 Locked
- Error message includes "banned" or "suspended"

**Solutions:**

```bash
# Check ban status
curl -X GET http://localhost:3000/users/:id \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Unban user
curl -X POST http://localhost:3000/admin/users/:id/unban \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Check ban expiration in database
psql -U postgres -d fifi -c "SELECT id, email, banned, ban_expires FROM \"user\" WHERE id=123;"
```

### Problem: Session expired immediately after login

**Symptoms:**
- Token works initially but expires in seconds
- `expiresAt` time is in the past

**Causes:**
- Server time is incorrect
- JWT_ACCESS_TOKEN_EXPIRY misconfigured

**Solutions:**

```bash
# Check server time
date

# Sync server time (Linux)
sudo ntpdate -s time.nist.gov

# Check JWT expiry configuration
echo $JWT_ACCESS_TOKEN_EXPIRY  # Should be "15m" or similar

# Verify token expiry
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' | jq '.expiresAt'
```

---

## Token Issues

### Problem: "Invalid token" or "Token malformed"

**Symptoms:**
- Protected routes return 401
- Error: "Invalid token" or "jwt malformed"

**Causes:**
1. Token format incorrect (missing "Bearer " prefix)
2. Token corrupted during storage
3. JWT_SECRET mismatch between token creation and validation

**Solutions:**

```bash
# 1. Check token format
# Correct: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
# Wrong: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." (missing Bearer)

# 2. Decode token to check structure (use jwt.io or)
node -e "
const token = 'YOUR_TOKEN_HERE';
const parts = token.split('.');
console.log(JSON.parse(Buffer.from(parts[1], 'base64').toString()));
"

# 3. Verify JWT_SECRET hasn't changed
echo $JWT_SECRET

# 4. Generate new token
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'
```

### Problem: Token refresh fails

**Symptoms:**
- POST /auth/refresh-token returns 401
- Error: "Invalid refresh token"

**Causes:**
1. Refresh token expired
2. Refresh token revoked
3. JWT_REFRESH_SECRET mismatch

**Solutions:**

```bash
# Check refresh token in database
psql -U postgres -d fifi -c "
SELECT id, token_type, revoked, expires_at, created_at 
FROM session 
WHERE token LIKE 'FIRST_20_CHARS%' 
ORDER BY created_at DESC 
LIMIT 5;
"

# Check if token is revoked
psql -U postgres -d fifi -c "
SELECT revoked, revoked_at 
FROM session 
WHERE token = 'YOUR_REFRESH_TOKEN';
"

# If revoked, user must login again
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'
```

### Problem: Token works but user data missing

**Symptoms:**
- Token validates but `request.user` is undefined
- Routes work but `@CurrentUser()` returns null

**Causes:**
1. BearerTokenGuard not extracting user properly
2. Token payload incomplete

**Solutions:**

```typescript
// Add logging to BearerTokenGuard
console.log('Token payload:', decoded);
console.log('User extracted:', user);

// Check what's in the token
const decoded = jwt.verify(token, process.env.JWT_SECRET);
console.log('Token contains:', decoded);
```

---

## Permission Issues

### Problem: "Forbidden" - User has correct role

**Symptoms:**
- Returns 403 even with correct role
- RolesGuard rejecting valid access

**Causes:**
1. Role not properly assigned
2. Role name mismatch (case-sensitive)
3. Token doesn't include roles

**Solutions:**

```bash
# 1. Check user's roles
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN" | jq '.roles'

# 2. Verify role assignment in database
psql -U postgres -d fifi -c "
SELECT u.id, u.email, r.name, r.slug 
FROM \"user\" u
JOIN \"UserRole\" ur ON u.id = ur.user_id
JOIN \"Role\" r ON ur.role_id = r.id
WHERE u.id = 123;
"

# 3. Assign role if missing
curl -X POST http://localhost:3000/admin/users/123/roles \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"roleId": 1}'

# 4. Check endpoint role requirements
# Look for @Roles('admin', 'manager') in controller
```

### Problem: Admin endpoints return 403 for admin user

**Symptoms:**
- Admin user gets 403 on admin endpoints
- Other endpoints work fine

**Causes:**
1. Role slug mismatch ('Admin' vs 'admin')
2. Role level insufficient
3. Multiple roles with conflicting levels

**Solutions:**

```sql
-- Check role configuration
SELECT * FROM "Role" WHERE slug = 'admin';

-- Verify it's lowercase 'admin'
-- If not, update:
UPDATE "Role" SET slug = 'admin' WHERE name = 'Admin';

-- Check user has admin role
SELECT u.email, r.name, r.slug, r.level
FROM "user" u
JOIN "UserRole" ur ON u.id = ur.user_id
JOIN "Role" r ON ur.role_id = r.id
WHERE u.id = 123;
```

---

## Database Issues

### Problem: "Cannot resolve dependency" errors

**Symptoms:**
- Server fails to start
- Error mentions PrismaService or other services

**Causes:**
1. Service not exported from module
2. Circular dependency
3. Missing module import

**Solutions:**

```typescript
// 1. Check service is exported
// In auth.module.ts
exports: [
  TokenService,
  BearerTokenGuard,
  RolesGuard,
  AuditLogService, // Must be exported!
]

// 2. Check module is imported in AppModule
imports: [
  AuthEndpointsModule, // Required for AuditLogService
  // ...
]

// 3. Restart the server
bun run start:dev
```

### Problem: Database connection fails

**Symptoms:**
- "Cannot connect to database"
- "Connection refused"

**Causes:**
1. PostgreSQL not running
2. Wrong DATABASE_URL
3. Firewall blocking connection

**Solutions:**

```bash
# 1. Check PostgreSQL is running
sudo systemctl status postgresql  # Linux
# or
pg_ctl status  # Windows

# 2. Start PostgreSQL if stopped
sudo systemctl start postgresql  # Linux
# or
pg_ctl start  # Windows

# 3. Test connection
psql -U postgres -h localhost -d fifi

# 4. Verify DATABASE_URL format
# postgresql://username:password@localhost:5432/database_name
echo $DATABASE_URL

# 5. Check firewall (Linux)
sudo ufw status
sudo ufw allow 5432/tcp
```

### Problem: Migration fails

**Symptoms:**
- `prisma migrate deploy` fails
- Migration SQL errors

**Causes:**
1. Database schema drift
2. Conflicting data
3. Permissions issue

**Solutions:**

```bash
# 1. Check migration status
bun prisma migrate status

# 2. Reset database (DEVELOPMENT ONLY!)
bun prisma migrate reset

# 3. Apply migrations one by one
bun prisma migrate deploy

# 4. Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log

# 5. Verify database permissions
psql -U postgres -c "
GRANT ALL PRIVILEGES ON DATABASE fifi TO your_user;
GRANT ALL ON SCHEMA public TO your_user;
"
```

---

## Rate Limiting Issues

### Problem: "Too Many Requests" (429)

**Symptoms:**
- API returns 429
- Error: "Too many requests"

**Causes:**
1. Exceeded rate limit
2. Shared IP address
3. Bot/script making too many requests

**Solutions:**

```bash
# 1. Wait for rate limit window to expire
# Login: wait 60 seconds
# Signup: wait 1 hour
# Other: wait 60 seconds

# 2. Check current limits in app.module.ts
ThrottlerModule.forRoot([{
  ttl: 60000,  // Time window
  limit: 10,   // Max requests
}])

# 3. Temporarily increase limits for testing
# Update app.module.ts and restart

# 4. Use different IP or wait
```

### Problem: Rate limit too aggressive

**Symptoms:**
- Legitimate users getting 429
- Normal usage blocked

**Solutions:**

```typescript
// 1. Increase global limit in app.module.ts
ThrottlerModule.forRoot([{
  ttl: 60000,
  limit: 100, // Increase from 10
}])

// 2. Adjust endpoint-specific limits
@Throttle({ default: { limit: 10, ttl: 60000 } })
@Post('login')

// 3. Exempt trusted IPs (custom implementation)
```

---

## Gate Issues

### Problem: User has gate but feature doesn't work

**Symptoms:**
- Gate shows in /auth/me
- Feature still says "Premium required"

**Causes:**
1. Gate is inactive globally
2. Frontend not checking gates correctly
3. Backend gate check too strict

**Solutions:**

```bash
# 1. Check gate status
curl -X GET http://localhost:3000/gates/:id \
  -H "Authorization: Bearer ADMIN_TOKEN" | jq '.active'

# 2. Activate gate if needed
curl -X PUT http://localhost:3000/gates/:id \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"active": true}'

# 3. Verify user has gate and it's active
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer USER_TOKEN" | jq '.gates[] | select(.slug=="premium-features")'

# Expected output:
# {
#   "id": 1,
#   "name": "Premium Features",
#   "slug": "premium-features",
#   "active": true  # Must be true!
# }
```

### Problem: Gate assignment fails silently

**Symptoms:**
- POST /users/:id/gates returns success
- But gate doesn't appear in user's gates

**Causes:**
1. Database constraint violation
2. Gate or user doesn't exist
3. Gate already assigned

**Solutions:**

```bash
# 1. Check audit logs
psql -U postgres -d fifi -c "
SELECT * FROM audit_log 
WHERE user_id = 123 
AND action = 'gate_assigned' 
ORDER BY created_at DESC 
LIMIT 5;
"

# 2. Check for duplicates
psql -U postgres -d fifi -c "
SELECT * FROM \"UserGate\" 
WHERE user_id = 123 AND gate_id = 1;
"

# 3. Verify gate exists and is active
psql -U postgres -d fifi -c "
SELECT * FROM \"Gate\" WHERE id = 1;
"
```

---

## Server Issues

### Problem: Server won't start

**Symptoms:**
- `bun run start:dev` fails
- Various error messages

**Solutions:**

```bash
# 1. Check for port conflicts
netstat -ano | findstr :3000  # Windows
lsof -i :3000  # Linux/Mac

# Kill process using port
# Windows: taskkill /PID <PID> /F
# Linux: kill -9 <PID>

# 2. Check environment variables
cat .env | grep JWT_SECRET
cat .env | grep DATABASE_URL

# 3. Reinstall dependencies
rm -rf node_modules
bun install

# 4. Regenerate Prisma client
bun prisma generate

# 5. Check for syntax errors
bun run build

# 6. Check logs
cat logs/error.log
```

### Problem: Hot reload not working

**Symptoms:**
- Changes don't reflect
- Server doesn't restart

**Solutions:**

```bash
# 1. Restart server manually
# Ctrl+C then
bun run start:dev

# 2. Clear build cache
rm -rf dist
bun run build

# 3. Check file watchers limit (Linux)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

---

## Common Error Messages

### "Cannot resolve environment variable: DATABASE_URL"

**Cause:** .env file not loaded or DATABASE_URL not set

**Solution:**
```bash
# Check .env file exists
ls -la .env

# Add DATABASE_URL
echo 'DATABASE_URL="postgresql://user:pass@localhost:5432/fifi"' >> .env

# Restart server
```

### "jwt must be provided"

**Cause:** Authorization header missing or malformed

**Solution:**
```bash
# Correct format
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Not: Authorization: eyJhbGciOi...  (missing "Bearer ")
# Not: Bearer: eyJhbGciOi...  (wrong header name)
```

### "Invalid signature"

**Cause:** JWT_SECRET doesn't match

**Solution:**
```bash
# Check JWT_SECRET is correct
echo $JWT_SECRET

# If changed, all existing tokens are invalid
# Users must login again
```

### "Cannot read property 'id' of undefined"

**Cause:** User not attached to request

**Solution:**
```typescript
// Add guard to route
@UseGuards(BearerTokenGuard)
@Get('protected')
async getProtected(@CurrentUser() user: ITokenUser) {
  // user is now guaranteed to exist
}
```

### "Circular dependency detected"

**Cause:** Modules importing each other

**Solution:**
```typescript
// Use forwardRef() to resolve
@Module({
  imports: [forwardRef(() => OtherModule)],
})
```

---

## Debugging Tools

### 1. Decode JWT Token

**Online:** https://jwt.io

**Command Line:**
```bash
# Node.js
node -e "
const token = 'YOUR_TOKEN_HERE';
const parts = token.split('.');
console.log('Header:', JSON.parse(Buffer.from(parts[0], 'base64').toString()));
console.log('Payload:', JSON.parse(Buffer.from(parts[1], 'base64').toString()));
"

# PowerShell
$token = "YOUR_TOKEN_HERE"
$parts = $token.Split('.')
[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($parts[1]))
```

### 2. Check Database State

```sql
-- Active sessions
SELECT COUNT(*) FROM session WHERE revoked = false;

-- Banned users
SELECT id, email, ban_reason, ban_expires FROM "user" WHERE banned = true;

-- User roles
SELECT u.email, r.name, r.slug 
FROM "user" u
JOIN "UserRole" ur ON u.id = ur.user_id
JOIN "Role" r ON ur.role_id = r.id;

-- Recent audit logs
SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 20;

-- Gate assignments
SELECT u.email, g.name, g.slug, g.active
FROM "user" u
JOIN "UserGate" ug ON u.id = ug.user_id
JOIN "Gate" g ON ug.gate_id = g.id;
```

### 3. Test Authentication Flow

```bash
# 1. Signup
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email":"test@example.com",
    "password":"Test1234",
    "firstName":"Test",
    "lastName":"User"
  }' | jq '.'

# 2. Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email":"test@example.com",
    "password":"Test1234"
  }' | jq '.accessToken' -r > token.txt

# 3. Test protected route
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer $(cat token.txt)" | jq '.'

# 4. Refresh token
curl -X POST http://localhost:3000/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$(jq -r '.refreshToken' < login_response.json)\"}" | jq '.'
```

### 4. Enable Debug Logging

```typescript
// main.ts
app.useLogger(['log', 'error', 'warn', 'debug', 'verbose']);

// Or via environment
LOG_LEVEL=debug bun run start:dev
```

### 5. API Testing with Postman/Insomnia

Import this collection structure:

```json
{
  "info": { "name": "Auth API Tests" },
  "item": [
    {
      "name": "Login",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/auth/login",
        "body": {
          "mode": "raw",
          "raw": "{\"email\":\"{{email}}\",\"password\":\"{{password}}\"}"
        }
      }
    },
    {
      "name": "Get Me",
      "request": {
        "method": "GET",
        "url": "{{baseUrl}}/auth/me",
        "header": [
          {"key": "Authorization", "value": "Bearer {{accessToken}}"}
        ]
      }
    }
  ]
}
```

---

## Performance Debugging

### Slow Database Queries

```sql
-- Enable query logging
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_duration = on;

-- Find slow queries
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;

-- Check missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY abs(correlation) DESC;
```

### Memory Leaks

```bash
# Monitor memory usage
while true; do
  ps aux | grep node | grep -v grep
  sleep 5
done

# Use Node.js heap profiling
node --inspect dist/main.js
# Open chrome://inspect in Chrome
```

---

## Getting Help

### Before Asking for Help

1. **Check this guide** for your specific error
2. **Search logs** for the full error message
3. **Test in isolation** (minimal reproducible example)
4. **Gather information**:
   - Error messages (full stack trace)
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment (OS, Node version, etc.)

### Where to Get Help

1. **Documentation:**
   - [Client Integration Guide](./CLIENT_INTEGRATION_GUIDE.md)
   - [Deployment Guide](./DEPLOYMENT_GUIDE.md)
   - [Gate Management Guide](./GATE_MANAGEMENT_GUIDE.md)

2. **Logs:**
   - `logs/error.log` - Application errors
   - `logs/combined.log` - All logs
   - PostgreSQL logs

3. **Database:**
   - Check `audit_log` table for security events
   - Query `session` table for token issues
   - Review `UserRole` and `UserGate` for permissions

4. **Contact:**
   - Email: dev-team@example.com
   - Slack: #auth-support
   - GitHub Issues: [repository-url]/issues

### Information to Include

When reporting issues, include:

```
**Environment:**
- OS: [Windows/Linux/Mac]
- Node Version: [18.x]
- Bun Version: [1.x]
- Database: [PostgreSQL 14+]

**Error Message:**
[Full error with stack trace]

**Steps to Reproduce:**
1. Call POST /auth/login
2. Use returned token on GET /auth/me
3. Error occurs

**Expected Behavior:**
User data should be returned

**Actual Behavior:**
Returns 401 Unauthorized

**Additional Context:**
- JWT_SECRET is set
- Database connection works
- Token decodes successfully on jwt.io
```

---

## Quick Reference

### Most Common Issues

| Issue | Quick Fix |
|-------|-----------|
| 401 Unauthorized | Check token format has "Bearer " prefix |
| 403 Forbidden | Verify user has required role/gate |
| 429 Too Many Requests | Wait for rate limit window to expire |
| Server won't start | Kill process on port 3000, restart |
| Database connection failed | Check PostgreSQL is running |
| Token expired | Refresh token or login again |
| Gate not working | Check gate is active globally |
| Role not working | Verify role slug matches (lowercase) |

### Diagnostic Commands

```bash
# Check server status
curl http://localhost:3000/health

# Check database connection
psql -U postgres -d fifi -c "SELECT 1;"

# View active sessions
psql -U postgres -d fifi -c "SELECT COUNT(*) FROM session WHERE revoked=false;"

# Check user roles
psql -U postgres -d fifi -c "SELECT u.email, r.name FROM \"user\" u JOIN \"UserRole\" ur ON u.id=ur.user_id JOIN \"Role\" r ON ur.role_id=r.id WHERE u.email='user@example.com';"

# Decode JWT
node -e "console.log(JSON.parse(Buffer.from('PAYLOAD_PART'.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString()))"
```

---

**Last Updated:** February 4, 2026
