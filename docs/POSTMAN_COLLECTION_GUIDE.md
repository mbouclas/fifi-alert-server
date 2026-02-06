# FiFi Alert API - Postman Collection Guide

This guide explains how to use the FiFi Alert API Postman collection for testing and development.

## 📥 Importing the Collection

1. Open Postman
2. Click **Import** button (top left)
3. Select **File** tab
4. Choose [`FiFi_Alert_API.postman_collection.json`](./FiFi_Alert_API.postman_collection.json)
5. Click **Import**

## 🔧 Setup

### 1. Configure Environment Variables

The collection includes several variables that need to be configured:

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `baseUrl` | API base URL | `http://localhost:3000` |
| `accessToken` | JWT access token (auto-populated after login) | `` |
| `refreshToken` | JWT refresh token (auto-populated after login) | `` |
| `userId` | Current user ID (auto-populated after login) | `` |
| `alertId` | Last created alert ID (auto-populated) | `` |
| `deviceId` | Last registered device ID (auto-populated) | `` |

**To edit variables:**
1. Click on the collection name
2. Select the **Variables** tab
3. Update the **Current Value** column
4. Click **Save**

### 2. Authentication Flow

The collection uses Bearer Token authentication. Follow these steps:

#### Option 1: Signup and Login (New User)
1. **Signup**: `POST /auth/signup` - Creates a new account
   - The access token and refresh token are automatically saved
2. **Get Current User**: `GET /auth/me` - Verify authentication

#### Option 2: Login (Existing User)
1. **Login**: `POST /auth/login` - Authenticate with email/password
   - The access token and refresh token are automatically saved
2. **Get Current User**: `GET /auth/me` - Verify authentication

#### Auto-Token Management
- Access tokens are automatically set in the Authorization header
- When you login or signup, tokens are saved to collection variables
- If your access token expires, use **Refresh Access Token** endpoint

## 📚 Collection Structure

The collection is organized into the following sections:

### 1. Authentication
- **Login** - Authenticate and get tokens
- **Signup** - Create new account
- **Get Current User (Me)** - Get authenticated user details
- **Logout** - Sign out current user
- **Request Password Reset** - Initiate password reset flow
- **Reset Password** - Complete password reset with token
- **Update Password** - Change password (authenticated)
- **Refresh Access Token** - Get new access token using refresh token

### 2. Health Check
- **Health Status** - Check system health (database, Redis, disk)

### 3. Alerts
- **Create Alert** - Report a missing pet
- **Get Alert by ID** - View specific alert
- **Search Alerts** - Find alerts by location
- **Update Alert** - Modify alert details
- **Resolve Alert** - Mark pet as found
- **Renew Alert** - Extend alert expiration
- **Upload Alert Photos** - Add photos to alert (max 5)

### 4. Devices
- **Register Device** - Register/update device for notifications
- **Get All Devices** - List user's devices
- **Update Device Location** - Update GPS/postal codes
- **Update Push Token** - Refresh FCM/APNs token
- **Create Saved Zone** - Add high-priority location
- **Get Saved Zones** - List saved zones
- **Update Saved Zone** - Modify zone details
- **Delete Saved Zone** - Remove saved zone

### 5. Sightings
- **Report Sighting** - Report pet sighting
- **Get Sightings for Alert** - View sightings for an alert
- **Dismiss Sighting** - Mark sighting as not relevant
- **Upload Sighting Photo** - Add photo to sighting

### 6. Users
- **Create User** - Create user account (Admin)
- **Get All Users** - List users with pagination
- **Get User by ID** - View user details
- **Get User by Email** - Find user by email
- **Update User** - Modify user details
- **Delete User** - Remove user account
- **Assign Gate to User** - Grant feature access
- **Remove Gate from User** - Revoke feature access
- **Get User Gates** - List user's feature flags

### 7. Gates (Feature Flags)
- **Create Gate** - Create feature flag
- **Get All Gates** - List all gates
- **Get Gate by ID** - View gate details
- **Update Gate** - Modify gate
- **Delete Gate** - Remove gate
- **Get Users with Gate** - List users with specific gate

### 8. Admin
- **Ban User** - Ban user account
- **Unban User** - Remove ban
- **List Active Sessions** - View all sessions
- **Revoke Session** - Terminate specific session

## 🚀 Quick Start Workflow

### Testing Alert Flow
1. **Login** or **Signup** to get authenticated
2. **Register Device** to receive notifications
3. **Create Alert** for a missing pet
4. **Upload Alert Photos** (optional)
5. **Search Alerts** to verify it appears in results
6. **Report Sighting** (as another user)
7. **Get Sightings for Alert** to see reports
8. **Resolve Alert** when pet is found

### Testing Location Features
1. **Register Device** with initial location
2. **Create Saved Zone** (Home, Work, etc.)
3. **Update Device Location** as you move
4. **Search Alerts** near your current location

### Testing Admin Features
1. Login with admin account
2. **Get All Users** to see user list
3. **Create Gate** for a new feature
4. **Assign Gate to User** to grant access
5. **List Active Sessions** for monitoring
6. **Ban User** if necessary (testing only)

## 🔑 Authentication Headers

The collection automatically manages authentication via Bearer Tokens:

```
Authorization: Bearer {{accessToken}}
```

**Note:** Some endpoints do not require authentication:
- `GET /health` - Health check
- `POST /auth/login` - Login
- `POST /auth/signup` - Signup
- `POST /auth/request-password-reset` - Password reset request
- `POST /auth/reset-password` - Password reset
- `POST /auth/refresh-token` - Token refresh
- `GET /alerts` - Search alerts (public)
- `GET /alerts/:id` - View alert (public)

## 📝 Request Body Examples

### Create Alert
```json
{
  "pet_name": "Buddy",
  "pet_type": "DOG",
  "breed": "Golden Retriever",
  "color": "Golden",
  "size": "LARGE",
  "distinctive_features": "White patch on chest, wearing blue collar",
  "last_seen_location": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "address": "Central Park, New York, NY"
  },
  "last_seen_time": "2026-02-06T10:30:00Z",
  "contact_phone": "+1234567890",
  "contact_email": "owner@example.com",
  "reward_amount": 500,
  "additional_notes": "Very friendly, responds to 'Buddy'"
}
```

### Register Device
```json
{
  "device_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "device_name": "John's iPhone",
  "platform": "IOS",
  "push_token": "fcm-or-apns-token-here",
  "app_version": "1.0.0",
  "os_version": "17.2",
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060
  },
  "postal_codes": ["10001", "10002"]
}
```

### Report Sighting
```json
{
  "alert_id": "alert-cuid-here",
  "sighting_time": "2026-02-06T14:30:00Z",
  "location": {
    "latitude": 40.7580,
    "longitude": -73.9855,
    "address": "Near Times Square, New York, NY"
  },
  "description": "Saw a golden retriever matching the description",
  "reporter_contact": "+1987654321"
}
```

## 📊 Response Examples

### Successful Login Response
```json
{
  "message": "Login successful",
  "user": {
    "id": "1",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "session": {
    "token": "session-token-here",
    "expiresAt": "2026-03-06T10:00:00.000Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2026-02-06T11:00:00.000Z"
}
```

### Alert Response
```json
{
  "id": "clxxxxx",
  "pet_name": "Buddy",
  "pet_type": "DOG",
  "status": "ACTIVE",
  "created_at": "2026-02-06T10:00:00.000Z",
  "expires_at": "2026-02-13T10:00:00.000Z",
  "photo_urls": [
    "http://localhost:3000/uploads/alerts/1234567890-photo1.jpg"
  ]
}
```

### Error Response
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Invalid credentials"
}
```

## 🧪 Testing Tips

### Rate Limiting
Be aware of rate limits:
- **Login**: 5 attempts per minute
- **Signup**: 3 signups per hour
- **Create Alert**: 5 alerts per hour per user
- **Refresh Token**: 10 refreshes per minute

### File Uploads
For file upload endpoints:
1. Select **Body** tab
2. Choose **form-data** type
3. Select **File** type for the field
4. Click **Select Files** to choose image(s)

### Testing Geospatial Queries
Use real coordinates for testing:
- **New York City**: `40.7128, -74.0060`
- **Los Angeles**: `34.0522, -118.2437`
- **Chicago**: `41.8781, -87.6298`

### Debugging
- Check **Console** (bottom left) for request/response logs
- Use **Tests** tab to add custom assertions
- Enable **Follow redirects** in Settings if needed

## 🔄 Token Refresh Flow

When your access token expires (typically after 1 hour):

1. Get your stored refresh token from collection variables
2. Call **Refresh Access Token** endpoint
3. New access token is automatically saved
4. Continue making authenticated requests

Alternatively, just login again if refresh token also expired.

## 📖 Additional Resources

- [API Documentation](./HIGH_LEVEL_DESIGN.md)
- [Client Integration Guide](./CLIENT_INTEGRATION_GUIDE.md)
- [Bearer Token Setup](./BEARER_TOKEN_SETUP.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)

## 🆘 Common Issues

### "Unauthorized" errors
- Verify your access token is set in collection variables
- Try refreshing your token with the refresh token endpoint
- If still failing, login again

### "Rate limit exceeded"
- Wait for the rate limit window to reset
- See rate limits in Testing Tips section above

### File upload fails
- Ensure file size is under the limit (10MB for alerts, 10MB for sightings)
- Verify file type is supported (jpg, jpeg, png, gif, webp)
- Check that you're using **form-data** body type

### Cannot find alert/device/sighting
- Verify the ID is correct in the URL
- IDs are auto-populated after creation - check collection variables
- Replace `:id` parameters with actual values

## 💡 Pro Tips

1. **Use Variables**: Leverage collection variables for repeated values
2. **Environment Setup**: Create separate environments for dev/staging/prod
3. **Test Scripts**: Add test scripts to validate responses automatically
4. **Documentation**: Use the built-in Postman documentation feature
5. **Mock Server**: Use Postman's mock server for frontend development

---

**Need Help?** Check the [Troubleshooting Guide](./TROUBLESHOOTING.md) or review the [main README](../README.md).
