# Client Integration Guide

## Overview

This guide provides comprehensive instructions for integrating JWT bearer token authentication in your frontend or mobile application. The authentication system supports role-based access control (RBAC) and feature gates (feature flags).

---

## Table of Contents

1. [Authentication Flow](#authentication-flow)
2. [Token Storage](#token-storage)
3. [API Endpoints](#api-endpoints)
4. [Implementation Examples](#implementation-examples)
5. [Token Refresh Strategy](#token-refresh-strategy)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)
8. [Testing](#testing)

---

## Authentication Flow

### 1. User Sign Up

```typescript
// POST /auth/signup
const response = await fetch('http://localhost:3000/auth/signup', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePassword123!',
    firstName: 'John',
    lastName: 'Doe',
  }),
});

const data = await response.json();
// Response includes: accessToken, refreshToken, expiresAt, user
```

### 2. User Login

```typescript
// POST /auth/login
const response = await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePassword123!',
  }),
});

const data = await response.json();
// Response: { accessToken, refreshToken, expiresAt, user }
```

### 3. Accessing Protected Resources

```typescript
// GET /auth/me
const response = await fetch('http://localhost:3000/auth/me', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
});

const userData = await response.json();
// Response includes user data with roles and gates
```

---

## Token Storage

### Web Applications (Browser)

**Security Best Practices:**

1. **Access Token**: Store in memory (never localStorage)
2. **Refresh Token**: Store in HttpOnly cookie (preferred) or secure storage

```typescript
class TokenService {
  private accessToken: string | null = null;

  // Store access token in memory
  setAccessToken(token: string) {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  // Clear on logout
  clearTokens() {
    this.accessToken = null;
    // Refresh token in HttpOnly cookie is cleared by server
  }
}
```

### Mobile Applications (React Native)

**Use Secure Storage:**

```typescript
import * as SecureStore from 'expo-secure-store';

class TokenService {
  async setAccessToken(token: string) {
    await SecureStore.setItemAsync('accessToken', token);
  }

  async getAccessToken(): Promise<string | null> {
    return await SecureStore.getItemAsync('accessToken');
  }

  async setRefreshToken(token: string) {
    await SecureStore.setItemAsync('refreshToken', token);
  }

  async getRefreshToken(): Promise<string | null> {
    return await SecureStore.getItemAsync('refreshToken');
  }

  async clearTokens() {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
  }
}
```

---

## API Endpoints

### Authentication

| Endpoint | Method | Description | Rate Limit |
|----------|--------|-------------|------------|
| `/auth/signup` | POST | Register new user | 3/hour |
| `/auth/login` | POST | Authenticate user | 5/minute |
| `/auth/refresh-token` | POST | Refresh access token | 10/minute |
| `/auth/me` | GET | Get current user info | - |

### User Management (Admin/Manager)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/users` | GET | List all users | Bearer token |
| `/users/:id` | GET | Get user details | Bearer token |
| `/users/:id` | PUT | Update user | Admin/Manager |
| `/users/:id` | DELETE | Delete user | Admin only |

### Gate Management

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/users/:id/gates` | GET | Get user gates | Bearer token |
| `/users/:id/gates` | POST | Assign gate | Admin/Manager |
| `/users/:id/gates/:gateId` | DELETE | Remove gate | Admin/Manager |

### Pet Management

| Endpoint | Method | Description | Auth Required | Rate Limit |
|----------|--------|-------------|---------------|------------|
| `/pets` | POST | Register new pet | Bearer token | - |
| `/pets` | GET | List user's pets | Bearer token | - |
| `/pets/:id` | GET | Get pet details | Bearer token | - |
| `/pets/:id` | PUT | Update pet | Bearer token | - |
| `/pets/:id` | DELETE | Delete pet | Bearer token | - |
| `/pets/:id/missing` | PATCH | Mark pet as missing | Bearer token | - |
| `/pets/:id/found` | PATCH | Mark pet as found | Bearer token | - |
| `/pets/tag/:tagId` | GET | Lookup pet by tag (public) | None | 20/minute |
| `/users/:userId/pets` | GET | List user's pets | Bearer token | - |
| `/users/:userId/pets/:petId` | GET | Get user's specific pet | Bearer token | - |
| `/users/:userId/pets` | POST | Create pet for user | Bearer token | - |
| `/users/:userId/pets/:petId` | PUT | Update user's pet | Bearer token | - |
| `/users/:userId/pets/:petId` | DELETE | Delete user's pet | Bearer token | - |

#### Pet Registration Example

```typescript
// POST /pets
const response = await fetch('http://localhost:3000/pets', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'DOG', // DOG, CAT, BIRD, RABBIT, etc.
    name: 'Max',
    gender: 'MALE', // MALE, FEMALE (optional)
    size: 'MEDIUM', // SMALL, MEDIUM, LARGE (optional)
    photos: ['https://example.com/photo1.jpg'], // optional
    birthday: '2020-05-15T00:00:00.000Z', // optional
  }),
});

const pet = await response.json();
// Response includes: id, tagId, type, name, gender, size, photos, isMissing, userId, etc.
// tagId is auto-generated (9 chars, e.g., "PET7K9X2A")
```

#### Public Pet Lookup

```typescript
// GET /pets/tag/:tagId (No auth required)
const response = await fetch('http://localhost:3000/pets/tag/PET7K9X2A');
const pet = await response.json();
// Returns pet details - useful for finding lost pets
```

#### Mark Pet as Missing

```typescript
// PATCH /pets/:id/missing
const response = await fetch(`http://localhost:3000/pets/${petId}/missing`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
});

const pet = await response.json();
// Pet's isMissing field is now true
```

#### Mark Pet as Found

```typescript
// PATCH /pets/:id/found
const response = await fetch(`http://localhost:3000/pets/${petId}/found`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
});

const pet = await response.json();
// Pet's isMissing field is now false
// Related active alerts are automatically resolved
```

#### Alert Integration

When creating an alert for a registered pet, you can optionally include the `petId`:

```typescript
// POST /alerts (with petId)
const response = await fetch('http://localhost:3000/alerts', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    petId: 123, // Optional: links alert to registered pet
    pet: {
      name: 'Max',
      species: 'DOG',
      description: 'Friendly golden retriever',
    },
    location: {
      lat: 37.7749,
      lon: -122.4194,
      lastSeenTime: '2026-02-07T10:00:00Z',
      radiusKm: 5,
    },
    contact: {
      isPhonePublic: false,
    },
  }),
});
// When petId is provided, the pet is automatically marked as missing
// When the pet is marked as found, all active alerts are automatically resolved
```

---

## Implementation Examples

### React Authentication Hook

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: any | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<void>;
  isAuthenticated: () => boolean;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      login: async (email: string, password: string) => {
        const response = await fetch('http://localhost:3000/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          throw new Error('Login failed');
        }

        const data = await response.json();
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: data.user,
        });
      },

      logout: async () => {
        // Optional: Call server logout endpoint
        set({ accessToken: null, refreshToken: null, user: null });
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get();
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await fetch('http://localhost:3000/auth/refresh-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) {
          // Refresh failed, logout user
          get().logout();
          throw new Error('Token refresh failed');
        }

        const data = await response.json();
        set({ accessToken: data.accessToken });
      },

      isAuthenticated: () => {
        return !!get().accessToken;
      },
    }),
    {
      name: 'auth-storage',
      // Only persist refresh token, keep access token in memory for security
      partialize: (state) => ({ refreshToken: state.refreshToken }),
    }
  )
);
```

### Axios Interceptor

```typescript
import axios from 'axios';
import { useAuth } from './useAuth';

const api = axios.create({
  baseURL: 'http://localhost:3000',
});

// Request interceptor: Add access token
api.interceptors.request.use(
  (config) => {
    const { accessToken } = useAuth.getState();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Refresh the token
        await useAuth.getState().refreshAccessToken();

        // Retry the original request with new token
        const { accessToken } = useAuth.getState();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, redirect to login
        useAuth.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

### Fetch API with Token Refresh

```typescript
class ApiClient {
  private baseUrl = 'http://localhost:3000';
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  async request(endpoint: string, options: RequestInit = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    let response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 401: Try refreshing token
    if (response.status === 401 && this.refreshToken) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        // Retry with new token
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        response = await fetch(`${this.baseUrl}${endpoint}`, {
          ...options,
          headers,
        });
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async refreshAccessToken(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      this.accessToken = data.accessToken;
      return true;
    } catch {
      return false;
    }
  }

  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
  }
}

export const apiClient = new ApiClient();
```

---

## Token Refresh Strategy

### Proactive Refresh (Recommended)

Refresh tokens before they expire:

```typescript
class TokenManager {
  private refreshTimer: NodeJS.Timeout | null = null;

  scheduleRefresh(expiresAt: string) {
    // Clear existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Calculate time until 5 minutes before expiration
    const expiresTime = new Date(expiresAt).getTime();
    const now = Date.now();
    const refreshTime = expiresTime - now - (5 * 60 * 1000); // 5 min buffer

    if (refreshTime > 0) {
      this.refreshTimer = setTimeout(async () => {
        await useAuth.getState().refreshAccessToken();
      }, refreshTime);
    }
  }

  cancelRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}
```

### Reactive Refresh

Refresh only when 401 is received (simpler but less optimal):

```typescript
// See Axios interceptor example above
```

---

## Error Handling

### Common Error Responses

```typescript
interface ErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
}

// Handle authentication errors
async function handleAuthError(error: any) {
  if (error.response?.status === 401) {
    // Unauthorized - invalid/expired token
    await logout();
    redirectToLogin();
  } else if (error.response?.status === 403) {
    // Forbidden - insufficient permissions
    showError('You do not have permission for this action');
  } else if (error.response?.status === 429) {
    // Too many requests - rate limit
    showError('Too many attempts. Please try again later.');
  } else if (error.response?.status === 423) {
    // Locked - user is banned
    showError('Your account has been suspended');
    await logout();
  } else {
    // Generic error
    showError('An error occurred. Please try again.');
  }
}
```

### Error Types

| Status | Description | Action |
|--------|-------------|--------|
| 401 | Unauthorized (invalid/expired token) | Refresh token or redirect to login |
| 403 | Forbidden (insufficient role/permissions) | Show error message |
| 423 | Locked (user is banned) | Logout and show message |
| 429 | Too Many Requests (rate limit) | Show retry message |

---

## Best Practices

### Security

1. **Never log tokens** - Avoid logging access/refresh tokens in production
2. **Use HTTPS** - Always use HTTPS in production
3. **Secure storage** - Store tokens in HttpOnly cookies or secure storage
4. **Token rotation** - Implement refresh token rotation for enhanced security
5. **Short-lived access tokens** - Keep access tokens short-lived (15 minutes)

### Performance

1. **Token caching** - Cache tokens in memory for request efficiency
2. **Proactive refresh** - Refresh tokens before expiration
3. **Batch requests** - Minimize authentication overhead

### User Experience

1. **Silent refresh** - Refresh tokens in the background
2. **Graceful errors** - Show user-friendly error messages
3. **Offline support** - Handle offline scenarios gracefully

---

## Testing

### Test Authentication Flow

```typescript
describe('Authentication', () => {
  it('should login successfully', async () => {
    const response = await apiClient.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
      }),
    });

    expect(response.accessToken).toBeDefined();
    expect(response.refreshToken).toBeDefined();
    expect(response.user.email).toBe('test@example.com');
  });

  it('should refresh token successfully', async () => {
    // Login first
    const loginResponse = await apiClient.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123',
      }),
    });

    // Refresh token
    const refreshResponse = await apiClient.request('/auth/refresh-token', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: loginResponse.refreshToken,
      }),
    });

    expect(refreshResponse.accessToken).toBeDefined();
    expect(refreshResponse.accessToken).not.toBe(loginResponse.accessToken);
  });

  it('should access protected route with token', async () => {
    // Set token
    apiClient.setTokens(accessToken, refreshToken);

    // Access protected route
    const response = await apiClient.request('/auth/me');

    expect(response.user).toBeDefined();
    expect(response.roles).toBeDefined();
    expect(response.gates).toBeDefined();
  });
});
```

---

## Email Notifications

Many API endpoints automatically trigger email notifications to users. Understanding these triggers helps you set proper user expectations in your UI.

### Automatic Email Triggers

| Endpoint | Method | Email Sent | Template | Recipients |
|----------|--------|------------|----------|------------|
| `/auth/signup` | POST | Welcome Email | `welcome` | New user |
| `/users` | POST | Welcome Email + Invite | `welcome`, `invite` | New user |
| `/auth/verify-email` | POST | Email Verification | `emailVerification` | Requesting user |
| `/auth/activate` | POST | Account Activation | `accountActivation` | Requesting user |
| `/auth/forgot-password` | POST | Forgot Password | `forgotPassword` | User (if exists) |
| `/auth/reset-password` | POST | Password Reset Confirmation | `passwordReset` | User |
| `/auth/change-password` | POST | Password Changed Alert | `passwordChanged` | User |
| `/auth/login` | POST | Login Notification (optional) | `loginNotification` | User |
| `/alerts` | POST | Alert Created Confirmation | `alertCreated` | Alert creator |
| `/alerts/:id/publish` | POST | Alert Published Notification | `alertPublished` | Alert creator + nearby users |
| `/alerts/:id/resolve` | POST | Alert Resolved Confirmation | `alertResolved` | Alert creator |
| `/sightings` | POST | Sighting Reported | `sightingReported` | Alert creator |
| `/sightings/:id/dismiss` | POST | Sighting Dismissed (optional) | `sightingDismissed` | Sighting reporter |

### Email Notification Best Practices

#### 1. Set User Expectations

Display clear messages in your UI when actions will trigger emails:

```typescript
// Good - Inform user about email
<button onClick={handleSignup}>
  Sign Up - We'll send you a welcome email
</button>

// Better - Include email preferences
<Checkbox checked={emailNotifications}>
  Send me email notifications
</Checkbox>
```

#### 2. Handle Email Failures Gracefully

Emails are sent asynchronously and failures don't block operations:

```typescript
// User creation succeeds even if email fails
const { user, emailSent } = await createUser(data);

if (!emailSent) {
  showWarning('Account created, but welcome email may be delayed');
}
```

#### 3. Provide Resend Options

For critical emails (verification, password reset), offer resend functionality:

```typescript
async function resendVerificationEmail() {
  await fetch('/auth/resend-verification', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  
  showToast('Verification email sent!');
}
```

#### 4. Email Rate Limits

Be aware that email-triggering endpoints have rate limits:

- **Password Reset**: 3 requests per hour per email
- **Verification Email**: 5 requests per hour per user
- **Alert Notifications**: 5 alerts per hour per user

Show appropriate error messages when limits are reached.

### Email Content Localization

Currently, all emails are sent in English. For multi-language support:

1. Set user language preference via `/users/:id/preferences`
2. Backend will use appropriate template based on user locale
3. Future releases will support: Spanish, French, Portuguese

### Email Troubleshooting

If users report not receiving emails:

1. **Check spam folder** - Some providers flag automated emails
2. **Verify email address** - Check for typos in user profile
3. **Review email logs** - Check server logs for delivery status
4. **Test email provider** - Use `/admin/test-email` endpoint (Admin only)

For detailed email troubleshooting, see [Email Troubleshooting Guide](./EMAIL_TROUBLESHOOTING.md).

---

## Support

For issues or questions:
- Check the [API Documentation](./API_REFERENCE.md)
- Review [Common Issues](./TROUBLESHOOTING.md)
- Review [Email Troubleshooting](./EMAIL_TROUBLESHOOTING.md)
- Contact: dev-team@example.com

---

**Last Updated:** February 8, 2026
