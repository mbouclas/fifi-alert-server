# FiFi Alert Client Integration Guide

**Target Audience:** iOS, Android, and Web client developers  
**Last Updated:** February 9, 2026

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [TypeScript Data Models](#typescript-data-models)
3. [Authentication](#authentication)
4. [User Profile Management](#user-profile-management)
5. [Making API Requests](#making-api-requests)
6. [Core API Endpoints](#core-api-endpoints)
7. [Error Handling](#error-handling)
8. [Best Practices](#best-practices)

---

## Quick Start

### Base URL

**Development:** `http://localhost:3000`  
**Production:** `https://api.fifi-alert.com` (update based on your deployment)

### Required Headers

```typescript
// For authenticated requests
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer YOUR_ACCESS_TOKEN'
}

// For public/anonymous requests
{
  'Content-Type': 'application/json'
}
```

---

## TypeScript Data Models

### User Models

```typescript
/**
 * User object returned from API
 */
interface User {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  createdAt: string; // ISO 8601 date string
  updatedAt: string;
  banned: boolean;
  banReason?: string;
  banExpires?: string;
  
  // Relationships (optional, depends on include parameter)
  roles?: UserRole[];
  gates?: UserGate[];
  devices?: Device[];
  pets?: Pet[];
  alert_zones?: AlertZone[];
}

/**
 * Role information
 */
interface Role {
  id: number;
  name: string;
  slug: string;
  level: number; // Lower number = higher privilege (0 = super admin)
  description?: string;
  active: boolean;
}

/**
 * User role assignment
 */
interface UserRole {
  id: number;
  role: Role;
  created_at: string;
  updated_at: string;
}

/**
 * Gate (feature flag) information
 */
interface Gate {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  level: number;
}

/**
 * User gate assignment
 */
interface UserGate {
  id: number;
  gate: Gate;
  created_at: string;
  updated_at: string;
}
```

### Pet Models

```typescript
enum PetSpecies {
  DOG = 'DOG',
  CAT = 'CAT',
  BIRD = 'BIRD',
  RABBIT = 'RABBIT',
  OTHER = 'OTHER'
}

enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE'
}

enum Size {
  SMALL = 'SMALL',
  MEDIUM = 'MEDIUM',
  LARGE = 'LARGE'
}

interface Pet {
  id: number;
  tagId: string; // Unique 9-character identifier
  userId: number;
  
  // Pet Details
  petTypeId: number;
  name: string;
  gender?: Gender;
  photos: string[]; // Array of photo URLs
  size?: Size;
  isMissing: boolean;
  birthday?: string; // ISO 8601 date string
  
  // Timestamps
  created_at: string;
  updated_at: string;
  
  // Relationships
  petType?: PetType;
  alerts?: Alert[];
}

interface PetType {
  id: number;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}
```

### Alert Models

```typescript
enum AlertStatus {
  DRAFT = 'DRAFT',       // Created but not published
  ACTIVE = 'ACTIVE',     // Live, sending notifications
  RESOLVED = 'RESOLVED', // Pet found
  EXPIRED = 'EXPIRED'    // Auto-expired after duration
}

interface Alert {
  id: number;
  creatorId: number;
  petId?: number;
  
  // Pet Details
  petName: string;
  petSpecies: PetSpecies;
  petBreed?: string;
  petDescription: string;
  petColor?: string;
  petAgeYears?: number;
  petPhotos: string[];
  
  // Location Details
  lastSeenLat: number;
  lastSeenLon: number;
  locationAddress?: string;
  alertRadiusKm: number; // 1-50km range
  
  // Lifecycle
  status: AlertStatus;
  timeLastSeen: string; // ISO 8601
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  resolvedAt?: string;
  renewalCount: number; // Max 3 renewals
  
  // Contact (visibility depends on permissions)
  contactPhone?: string;
  contactEmail?: string;
  isPhonePublic: boolean;
  
  // Metadata
  affectedPostalCodes: string[];
  notes?: string;
  rewardOffered: boolean;
  rewardAmount?: number; // USD
  
  // Computed fields (in search results)
  distanceKm?: number;
  sightingCount?: number;
}
```

### Device Models

```typescript
enum DevicePlatform {
  IOS = 'IOS',
  ANDROID = 'ANDROID',
  WEB = 'WEB'
}

interface Device {
  id: number;
  userId: number;
  
  // Device Identity
  deviceUuid: string; // Client-generated UUID
  platform: DevicePlatform;
  osVersion?: string;
  appVersion?: string;
  
  // Push Notifications
  pushToken?: string;
  pushTokenUpdatedAt?: string;
  pushEnabled: boolean;
  
  // GPS Location
  gpsLat?: number;
  gpsLon?: number;
  gpsAccuracyMeters?: number;
  gpsUpdatedAt?: string;
  
  // IP Geolocation
  ipAddress?: string;
  ipLat?: number;
  ipLon?: number;
  ipCity?: string;
  ipCountry?: string;
  ipUpdatedAt?: string;
  
  // Postal Codes
  postalCodes: string[];
  
  // Metadata
  lastAppOpen?: string;
  createdAt: string;
  updatedAt: string;
}

interface SavedZone {
  id: number;
  deviceId: number;
  name: string; // e.g., "Home", "Work"
  lat: number;
  lon: number;
  radiusKm: number;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

interface AlertZone {
  id: number;
  userId: number;
  name: string;
  lat: number;
  lon: number;
  radiusMeters: number; // 50-5000 meter range
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}
```

### Sighting Models

```typescript
interface Sighting {
  id: number;
  alertId: number;
  reporterId: number;
  
  // Location
  sightingLat: number;
  sightingLon: number;
  locationAddress?: string;
  
  // Evidence
  photoUrl?: string;
  notes?: string;
  confidence?: 'CERTAIN' | 'LIKELY' | 'UNSURE';
  
  // Context
  sightingTime: string; // ISO 8601
  direction?: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'STATIONARY';
  
  // Status
  dismissed: boolean;
  dismissedReason?: string;
  dismissedAt?: string;
  
  // Metadata
  distanceFromAlertKm?: number;
  createdAt: string;
  updatedAt: string;
}
```

---

## Authentication

### 1. User Signup

**Endpoint:** `POST /auth/signup`  
**Authentication:** None (public)

```typescript
// Request
interface SignupRequest {
  firstName: string;    // Max 100 chars
  lastName: string;     // Max 100 chars
  email: string;        // Valid email
  password: string;     // Min 4 chars
  image?: string;       // Optional profile image URL
  callbackURL?: string; // Optional redirect URL
}

// Response
interface AuthResponse {
  message: string;
  user: {
    id: string;
    email: string;
    name?: string;
  };
  session?: {
    token: string;
    expiresAt?: string;
  };
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO 8601
}

// Example
const response = await fetch('http://localhost:3000/auth/signup', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    password: 'securePassword123'
  })
});

const data: AuthResponse = await response.json();
// Store tokens securely
localStorage.setItem('accessToken', data.accessToken);
localStorage.setItem('refreshToken', data.refreshToken);
```

### 2. User Login

**Endpoint:** `POST /auth/login`  
**Authentication:** None (public)  
**Rate Limit:** 5 attempts per minute

```typescript
// Request
interface LoginRequest {
  email: string;
  password: string;
}

// Response: Same as AuthResponse above

// Example
const response = await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'john.doe@example.com',
    password: 'securePassword123'
  })
});

if (response.status === 401) {
  console.error('Invalid credentials');
} else if (response.status === 429) {
  console.error('Too many login attempts. Try again later.');
} else {
  const data: AuthResponse = await response.json();
  // Store tokens
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
}
```

### 3. Token Refresh

**Endpoint:** `POST /auth/refresh`  
**Authentication:** Refresh token required

```typescript
// Request
interface RefreshRequest {
  refreshToken: string;
}

// Response: Same as AuthResponse

// Example
const response = await fetch('http://localhost:3000/auth/refresh', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    refreshToken: localStorage.getItem('refreshToken')
  })
});

if (response.ok) {
  const data: AuthResponse = await response.json();
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
}
```

### 4. Get Current User

**Endpoint:** `GET /auth/me`  
**Authentication:** Bearer token required

```typescript
// Response
interface MeResponse {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  createdAt: string;
  updatedAt: string;
  banned: boolean;
  roles: UserRole[];
  gates: UserGate[];
}

// Example
const response = await fetch('http://localhost:3000/auth/me', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
  }
});

if (response.ok) {
  const user: MeResponse = await response.json();
  console.log('Current user:', user);
}
```

### 5. Logout

**Endpoint:** `POST /auth/logout`  
**Authentication:** Bearer token required

```typescript
// Example
await fetch('http://localhost:3000/auth/logout', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
  }
});

// Clear local tokens
localStorage.removeItem('accessToken');
localStorage.removeItem('refreshToken');
```

---

## User Profile Management

### Update User Profile

**Endpoint:** `PUT /users/:id`  
**Authentication:** Bearer token required  
**Permission:** User can only update their own profile (or admin)

```typescript
// Request
interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  image?: string;
  settings?: Record<string, any>;
  meta?: Record<string, any>;
}

// Example
const userId = 42;
const response = await fetch(`http://localhost:3000/users/${userId}`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
  },
  body: JSON.stringify({
    firstName: 'Jane',
    lastName: 'Smith'
  })
});

const updatedUser: User = await response.json();
```

### Update Password

**Endpoint:** `PATCH /auth/update-password`  
**Authentication:** Bearer token required

```typescript
// Request
interface UpdatePasswordRequest {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions?: boolean; // Default: false
}

// Example
const response = await fetch('http://localhost:3000/auth/update-password', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
  },
  body: JSON.stringify({
    currentPassword: 'oldPassword123',
    newPassword: 'newSecurePassword456',
    revokeOtherSessions: true
  })
});
```

---

## Making API Requests

### HTTP Client Setup

```typescript
/**
 * API Client utility class
 */
class FiFiAlertClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add authorization header if token exists
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle token expiration
    if (response.status === 401 && this.refreshToken) {
      // Try to refresh token
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        // Retry original request with new token
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        const retryResponse = await fetch(url, { ...options, headers });
        return await this.handleResponse<T>(retryResponse);
      }
    }

    return await this.handleResponse<T>(response);
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Request failed');
    }
    return await response.json();
  }

  private async refreshAccessToken(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (response.ok) {
        const data: AuthResponse = await response.json();
        this.setTokens(data.accessToken, data.refreshToken);
        return true;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }
    return false;
  }

  // Convenience methods
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async put<T>(endpoint: string, body: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async patch<T>(endpoint: string, body: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

// Usage
const client = new FiFiAlertClient('http://localhost:3000');

// After login
const authData = await client.post<AuthResponse>('/auth/login', {
  email: 'user@example.com',
  password: 'password123'
});
client.setTokens(authData.accessToken, authData.refreshToken);

// Make authenticated requests
const user = await client.get<MeResponse>('/auth/me');
```

---

## Core API Endpoints

### Alerts

#### Create Alert

**Endpoint:** `POST /alerts`  
**Authentication:** Required  
**Rate Limits:**
- 5 alerts per user per hour
- 20 alerts per user per 24 hours
- 50 alerts per user per 7 days

```typescript
interface CreateAlertRequest {
  petDetails: {
    name: string;          // Max 100 chars
    species: PetSpecies;
    breed?: string;        // Max 100 chars
    description: string;   // Max 2000 chars
    color?: string;        // Max 50 chars
    ageYears?: number;     // 0-50
    photos?: string[];     // Max 10 URLs
  };
  locationDetails: {
    lat: number;           // -90 to 90
    lon: number;           // -180 to 180
    address?: string;      // Max 500 chars
    lastSeenTime: string;  // ISO 8601
    radiusKm: number;      // 1-50
  };
  contactDetails: {
    phone?: string;
    email?: string;
    isPhonePublic: boolean;
  };
  additionalDetails?: {
    notes?: string;
    rewardOffered?: boolean;
    rewardAmount?: number;
  };
  petId?: number; // Optional: link to registered pet
}

// Example
const alert = await client.post<Alert>('/alerts', {
  petDetails: {
    name: 'Max',
    species: 'DOG',
    breed: 'Golden Retriever',
    description: 'Friendly golden retriever with blue collar',
    color: 'Golden',
    ageYears: 3,
    photos: ['https://example.com/photo1.jpg']
  },
  locationDetails: {
    lat: 37.7749,
    lon: -122.4194,
    address: '123 Market St, San Francisco, CA',
    lastSeenTime: new Date().toISOString(),
    radiusKm: 5.0
  },
  contactDetails: {
    phone: '+1234567890',
    isPhonePublic: true
  },
  additionalDetails: {
    notes: 'Last seen near the park',
    rewardOffered: true,
    rewardAmount: 500
  }
});
```

#### Search Alerts

**Endpoint:** `GET /alerts`  
**Authentication:** Optional (public endpoint)

```typescript
interface SearchAlertsQuery {
  lat?: number;               // Search center latitude
  lon?: number;               // Search center longitude
  radius_km?: number;         // Search radius (default: 10km)
  status?: AlertStatus;       // Filter by status
  species?: PetSpecies;       // Filter by species
  limit?: number;             // Results per page (default: 20, max: 100)
  offset?: number;            // Pagination offset
}

// Example
const params = new URLSearchParams({
  lat: '37.7749',
  lon: '-122.4194',
  radius_km: '10',
  status: 'ACTIVE',
  limit: '20'
});

const alerts = await client.get<Alert[]>(`/alerts?${params}`);
```

#### Get Alert by ID

**Endpoint:** `GET /alerts/:id`  
**Authentication:** Optional

```typescript
const alert = await client.get<Alert>('/alerts/123');
```

#### Update Alert

**Endpoint:** `PATCH /alerts/:id`  
**Authentication:** Required (must be alert creator)

```typescript
// Request: Same structure as CreateAlertRequest, all fields optional
const updatedAlert = await client.patch<Alert>('/alerts/123', {
  petDetails: {
    description: 'Updated description with new details'
  }
});
```

#### Resolve Alert

**Endpoint:** `POST /alerts/:id/resolve`  
**Authentication:** Required (must be alert creator)

```typescript
interface ResolveAlertRequest {
  notes?: string;
  foundLocation?: {
    lat: number;
    lon: number;
    address?: string;
  };
  foundBy?: 'OWNER' | 'COMMUNITY' | 'SHELTER' | 'OTHER';
}

const resolvedAlert = await client.post<Alert>('/alerts/123/resolve', {
  notes: 'Found safe at home!',
  foundBy: 'OWNER'
});
```

### Devices

#### Register/Update Device

**Endpoint:** `POST /devices`  
**Authentication:** Required

```typescript
interface RegisterDeviceRequest {
  deviceUuid: string;        // Client-generated UUID
  platform: DevicePlatform;
  osVersion?: string;
  appVersion?: string;
  pushToken?: string;
  pushEnabled?: boolean;
  gpsLat?: number;
  gpsLon?: number;
  gpsAccuracyMeters?: number;
  postalCodes?: string[];
}

// Example
const device = await client.post<Device>('/devices', {
  deviceUuid: 'device-uuid-from-client',
  platform: 'IOS',
  osVersion: '16.0',
  appVersion: '1.0.0',
  pushToken: 'fcm-or-apns-token',
  pushEnabled: true,
  gpsLat: 37.7749,
  gpsLon: -122.4194,
  postalCodes: ['94102']
});
```

#### Update Device Location

**Endpoint:** `PATCH /devices/:id/location`  
**Authentication:** Required

```typescript
interface UpdateLocationRequest {
  gpsLat?: number;
  gpsLon?: number;
  gpsAccuracyMeters?: number;
  postalCodes?: string[];
}

const updatedDevice = await client.patch<Device>('/devices/123/location', {
  gpsLat: 37.7749,
  gpsLon: -122.4194,
  gpsAccuracyMeters: 10
});
```

### Pets

#### Create Pet

**Endpoint:** `POST /users/:userId/pets`  
**Authentication:** Required

```typescript
interface CreatePetRequest {
  petTypeId: number;
  name: string;          // Max 100 chars
  gender?: Gender;
  photos?: string[];
  size?: Size;
  birthday?: string;     // ISO 8601 date
}

const pet = await client.post<Pet>('/users/42/pets', {
  petTypeId: 1,
  name: 'Buddy',
  gender: 'MALE',
  size: 'LARGE',
  photos: ['https://example.com/buddy.jpg']
});
```

#### Get User Pets

**Endpoint:** `GET /users/:userId/pets`  
**Authentication:** Required

```typescript
const pets = await client.get<Pet[]>('/users/42/pets');
```

### Sightings

#### Report Sighting

**Endpoint:** `POST /sightings`  
**Authentication:** Required

```typescript
interface CreateSightingRequest {
  alertId: number;
  sightingLat: number;
  sightingLon: number;
  locationAddress?: string;
  photoUrl?: string;
  notes?: string;
  confidence?: 'CERTAIN' | 'LIKELY' | 'UNSURE';
  sightingTime: string;  // ISO 8601
  direction?: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'STATIONARY';
}

const sighting = await client.post<Sighting>('/sightings', {
  alertId: 123,
  sightingLat: 37.7750,
  sightingLon: -122.4195,
  notes: 'Saw a dog matching the description',
  confidence: 'LIKELY',
  sightingTime: new Date().toISOString()
});
```

#### Get Sightings for Alert

**Endpoint:** `GET /alerts/:alertId/sightings`  
**Authentication:** Optional

```typescript
const sightings = await client.get<Sighting[]>('/alerts/123/sightings');
```

---

## Error Handling

### Error Response Format

All errors follow a consistent format:

```typescript
interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
  error_code?: string;
  request_id?: string;
}
```

### Common HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200  | OK | Request succeeded |
| 201  | Created | Resource created successfully |
| 400  | Bad Request | Invalid request format |
| 401  | Unauthorized | Missing or invalid authentication |
| 403  | Forbidden | Authenticated but not authorized |
| 404  | Not Found | Resource doesn't exist |
| 409  | Conflict | Resource conflict (e.g., email already exists) |
| 422  | Unprocessable Entity | Validation failed |
| 429  | Too Many Requests | Rate limit exceeded |
| 500  | Internal Server Error | Server error |

### Error Handling Examples

```typescript
try {
  const alert = await client.post<Alert>('/alerts', alertData);
} catch (error: any) {
  if (error.message.includes('Rate limit exceeded')) {
    // Handle rate limit (429)
    console.error('You are creating alerts too quickly. Please wait.');
  } else if (error.message.includes('Unauthorized')) {
    // Handle auth error (401)
    console.error('Please log in again.');
    // Redirect to login
  } else if (error.message.includes('Validation failed')) {
    // Handle validation error (422)
    console.error('Please check your input:', error.message);
  } else {
    // Generic error
    console.error('An error occurred:', error.message);
  }
}
```

### Validation Errors

Validation errors (422) include detailed field-level information:

```json
{
  "statusCode": 422,
  "message": [
    "petDetails.name must be shorter than or equal to 100 characters",
    "locationDetails.lat must not be less than -90"
  ],
  "error": "Unprocessable Entity"
}
```

---

## Best Practices

### 1. Token Management

**Do:**
- Store tokens securely (secure storage on mobile, httpOnly cookies on web)
- Implement automatic token refresh before expiration
- Clear tokens on logout
- Never log or expose tokens in production

**Don't:**
- Store tokens in localStorage on web (XSS vulnerability)
- Send tokens in URL parameters
- Store tokens in plain text files

```typescript
// Good: Automatic token refresh
class TokenManager {
  private tokenExpiresAt: Date | null = null;

  setToken(token: string, expiresAt: string) {
    this.tokenExpiresAt = new Date(expiresAt);
    // Store securely
  }

  isTokenExpiringSoon(): boolean {
    if (!this.tokenExpiresAt) return true;
    const now = new Date();
    const fiveMinutes = 5 * 60 * 1000;
    return (this.tokenExpiresAt.getTime() - now.getTime()) < fiveMinutes;
  }
}
```

### 2. Location Updates

**Mobile Apps:**
- Update device location when app opens
- Update on significant location changes (iOS: significant-change, Android: FusedLocationProvider)
- Don't update every second (battery drain)
- Request appropriate location permissions

```typescript
// Good: Throttled location updates
class LocationManager {
  private lastUpdateTime: number = 0;
  private readonly MIN_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

  async updateLocation(lat: number, lon: number, accuracy: number) {
    const now = Date.now();
    if (now - this.lastUpdateTime < this.MIN_UPDATE_INTERVAL) {
      return; // Skip update
    }

    await client.patch('/devices/123/location', {
      gpsLat: lat,
      gpsLon: lon,
      gpsAccuracyMeters: accuracy
    });

    this.lastUpdateTime = now;
  }
}
```

### 3. Push Notifications

**iOS:**
- Request notification permissions early
- Update APNs token whenever it changes
- Handle notification actions (view alert, report sighting)

**Android:**
- Use FCM for push notifications
- Update FCM token on token refresh
- Handle notification channels properly

```typescript
// Example: Update push token
async function updatePushToken(deviceId: number, newToken: string) {
  await client.patch(`/devices/${deviceId}/push-token`, {
    push_token: newToken
  });
}
```

### 4. Image Uploads

Images must be uploaded before creating alerts:

1. Upload image to `/upload/image` endpoint
2. Receive image URL in response
3. Use image URL in alert creation

```typescript
// Step 1: Upload image
const formData = new FormData();
formData.append('file', imageFile);

const uploadResponse = await fetch('http://localhost:3000/upload/image', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});

const { url } = await uploadResponse.json();

// Step 2: Use URL in alert
const alert = await client.post<Alert>('/alerts', {
  petDetails: {
    name: 'Max',
    // ... other fields
    photos: [url] // Use uploaded URL
  },
  // ... other fields
});
```

### 5. Pagination

For endpoints that return lists, use pagination:

```typescript
async function loadAllAlerts() {
  const allAlerts: Alert[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const alerts = await client.get<Alert[]>(
      `/alerts?limit=${limit}&offset=${offset}`
    );
    
    allAlerts.push(...alerts);
    
    if (alerts.length < limit) {
      break; // No more results
    }
    
    offset += limit;
  }

  return allAlerts;
}
```

### 6. Network Resilience

Implement retry logic for transient failures:

```typescript
async function fetchWithRetry<T>(
  fetcher: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetcher();
    } catch (error: any) {
      const isLastAttempt = i === maxRetries - 1;
      const isRetryable = error.message.includes('Network') ||
                          error.message.includes('timeout');

      if (!isRetryable || isLastAttempt) {
        throw error;
      }

      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, i), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}

// Usage
const user = await fetchWithRetry(() => client.get<User>('/auth/me'));
```

### 7. Offline Support

Cache critical data for offline access:

```typescript
class OfflineCache {
  async getCachedUser(): Promise<User | null> {
    const cached = localStorage.getItem('cachedUser');
    return cached ? JSON.parse(cached) : null;
  }

  async setCachedUser(user: User) {
    localStorage.setItem('cachedUser', JSON.stringify(user));
  }

  async getUser(): Promise<User> {
    try {
      const user = await client.get<User>('/auth/me');
      await this.setCachedUser(user);
      return user;
    } catch (error) {
      // Fallback to cached data
      const cached = await this.getCachedUser();
      if (cached) {
        console.warn('Using cached user data (offline)');
        return cached;
      }
      throw error;
    }
  }
}
```

---

## Additional Resources

- **OpenAPI Specification:** 
  - JSON: `http://localhost:3000/api/openapi.json` (production: `https://api.fifi-alert.com/api/openapi.json`)
  - Swagger UI: `http://localhost:3000/api` (production: `https://api.fifi-alert.com/api`)
- **API Documentation:** See [Postman Collection](../FiFi_Alert_API.postman_collection.json)
- **Authentication Details:** See [Bearer Token Setup](../BEARER_TOKEN_SETUP.md)
- **Client Examples:** See [Client Integration Guide](../CLIENT_INTEGRATION_GUIDE.md)
- **Troubleshooting:** See [Troubleshooting Guide](../TROUBLESHOOTING.md)

---

## Support

For questions or issues:
- GitHub Issues: [github.com/yourorg/fifi-alert/issues]
- Email: support@fifi-alert.com
- Slack: #fifi-alert-help

---

**Last Updated:** February 9, 2026  
**API Version:** v1.0.0
