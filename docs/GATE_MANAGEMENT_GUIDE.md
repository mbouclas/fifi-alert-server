# Gate Management Workflow Guide

## Overview

Gates (also known as feature flags) are a powerful mechanism for controlling feature access in your application. This guide explains how to effectively use gates to manage feature rollouts, A/B testing, and user-specific functionality.

---

## Table of Contents

1. [What Are Gates?](#what-are-gates)
2. [Gate Structure](#gate-structure)
3. [Creating Gates](#creating-gates)
4. [Assigning Gates to Users](#assigning-gates-to-users)
5. [Checking Gates in Backend](#checking-gates-in-backend)
6. [Using Gates in Frontend](#using-gates-in-frontend)
7. [Best Practices](#best-practices)
8. [Common Use Cases](#common-use-cases)
9. [Gate Lifecycle](#gate-lifecycle)
10. [Examples](#examples)

---

## What Are Gates?

Gates are feature flags that control access to specific functionality in your application. They provide:

- **Gradual Rollouts**: Release features to a subset of users
- **A/B Testing**: Test different features with different user groups
- **Premium Features**: Control access to paid features
- **Beta Access**: Give early access to select users
- **Emergency Shutoff**: Quickly disable problematic features

### Key Characteristics

- **User-Level Control**: Assign gates to individual users
- **Global Toggle**: Enable/disable gates globally via `active` flag
- **Dynamic**: Can be changed without code deployment
- **Tracked**: Audit logs record gate assignments

---

## Gate Structure

Each gate has the following properties:

```typescript
interface Gate {
  id: number;           // Unique identifier
  name: string;         // Human-readable name (e.g., "Premium Features")
  slug: string;         // URL-friendly identifier (e.g., "premium-features")
  active: boolean;      // Global on/off switch
  level: number;        // Priority/tier level (optional)
  provider: string;     // Source/category (optional)
  created_at: Date;     // Creation timestamp
  updated_at: Date;     // Last update timestamp
}
```

### Naming Conventions

**Name:** Use descriptive, title-case names
- ✅ "Premium Features"
- ✅ "Advanced Analytics"
- ✅ "Beta Testing Program"
- ❌ "feature1" (not descriptive)

**Slug:** Use kebab-case, lowercase identifiers
- ✅ "premium-features"
- ✅ "advanced-analytics"
- ✅ "beta-testing-program"
- ❌ "Premium_Features" (not kebab-case)

---

## Creating Gates

### Via API (Admin Only)

**Create a new gate:**

```bash
curl -X POST http://localhost:3000/gates \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Premium Features",
    "slug": "premium-features",
    "active": true,
    "level": 10,
    "provider": "subscription"
  }'
```

**Response:**
```json
{
  "id": 1,
  "name": "Premium Features",
  "slug": "premium-features",
  "active": true,
  "level": 10,
  "provider": "subscription",
  "created_at": "2026-02-04T22:00:00.000Z",
  "updated_at": "2026-02-04T22:00:00.000Z"
}
```

### Via Prisma (Database Direct)

```typescript
// prisma/seed.ts or migration script
await prisma.gate.create({
  data: {
    name: 'Premium Features',
    slug: 'premium-features',
    active: true,
    level: 10,
    provider: 'subscription',
  },
});
```

### Bulk Creation

```typescript
const gates = [
  { name: 'Premium Features', slug: 'premium-features', active: true },
  { name: 'Beta Access', slug: 'beta-access', active: true },
  { name: 'Advanced Analytics', slug: 'advanced-analytics', active: true },
  { name: 'Data Export', slug: 'data-export', active: true },
  { name: 'API Access', slug: 'api-access', active: false },
];

await prisma.gate.createMany({ data: gates });
```

---

## Assigning Gates to Users

### Via API (Admin/Manager)

**Assign a gate to a user:**

```bash
curl -X POST http://localhost:3000/users/123/gates \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gateId": 1
  }'
```

**Remove a gate from a user:**

```bash
curl -X DELETE http://localhost:3000/users/123/gates/1 \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

**Get user's gates:**

```bash
curl -X GET http://localhost:3000/users/123/gates \
  -H "Authorization: Bearer USER_TOKEN"
```

### Programmatic Assignment

```typescript
// In a service or controller
async assignPremiumGate(userId: number) {
  const premiumGate = await this.prisma.gate.findUnique({
    where: { slug: 'premium-features' },
  });

  if (!premiumGate) {
    throw new Error('Premium gate not found');
  }

  await this.prisma.userGate.create({
    data: {
      user_id: userId,
      gate_id: premiumGate.id,
    },
  });

  // Log the assignment
  await this.auditLogService.log({
    action: 'gate_assigned',
    userId,
    metadata: { gateName: premiumGate.name },
  });
}
```

### Batch Assignment

```typescript
// Assign gate to multiple users
async assignGateToUsers(gateSlug: string, userIds: number[]) {
  const gate = await this.prisma.gate.findUnique({
    where: { slug: gateSlug },
  });

  if (!gate) {
    throw new Error('Gate not found');
  }

  await this.prisma.userGate.createMany({
    data: userIds.map(userId => ({
      user_id: userId,
      gate_id: gate.id,
    })),
    skipDuplicates: true, // Ignore if already assigned
  });
}
```

---

## Checking Gates in Backend

### Method 1: Via CurrentUser Decorator

```typescript
import { CurrentUser } from '../decorators/session.decorator';
import { ITokenUser } from '../auth/interfaces/token-user.interface';

@Get('premium-content')
async getPremiumContent(@CurrentUser() user: ITokenUser) {
  // Check if user has the gate
  const hasPremiumAccess = user.gates?.some(
    gate => gate.slug === 'premium-features' && gate.active
  );

  if (!hasPremiumAccess) {
    throw new ForbiddenException('Premium subscription required');
  }

  return this.getAdvancedData();
}
```

### Method 2: Via Service

```typescript
// gate-checker.service.ts
@Injectable()
export class GateCheckerService {
  constructor(private readonly prisma: PrismaService) {}

  async userHasGate(userId: number, gateSlug: string): Promise<boolean> {
    const userGate = await this.prisma.userGate.findFirst({
      where: {
        user_id: userId,
        gate: {
          slug: gateSlug,
          active: true, // Only count active gates
        },
      },
      include: { gate: true },
    });

    return !!userGate;
  }

  async requireGate(userId: number, gateSlug: string): Promise<void> {
    const hasAccess = await this.userHasGate(userId, gateSlug);
    
    if (!hasAccess) {
      throw new ForbiddenException(
        `Access denied. Required gate: ${gateSlug}`
      );
    }
  }
}
```

**Usage:**

```typescript
@Get('analytics')
async getAnalytics(@CurrentUser() user: ITokenUser) {
  await this.gateChecker.requireGate(user.id, 'advanced-analytics');
  return this.analyticsService.getAdvancedMetrics();
}
```

### Method 3: Via Custom Guard

```typescript
// gates.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const RequireGates = (...gates: string[]) => 
  SetMetadata('gates', gates);

@Injectable()
export class GatesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private gateChecker: GateCheckerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredGates = this.reflector.get<string[]>(
      'gates',
      context.getHandler(),
    );

    if (!requiredGates) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Check if user has ALL required gates
    for (const gateSlug of requiredGates) {
      const hasGate = await this.gateChecker.userHasGate(user.id, gateSlug);
      if (!hasGate) {
        return false;
      }
    }

    return true;
  }
}
```

**Usage:**

```typescript
@Get('premium-analytics')
@UseGuards(GatesGuard)
@RequireGates('premium-features', 'advanced-analytics')
async getPremiumAnalytics() {
  return this.analyticsService.getPremiumData();
}
```

---

## Using Gates in Frontend

### Step 1: Fetch User Gates

```typescript
// On login or app initialization
const response = await fetch('http://localhost:3000/auth/me', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
});

const data = await response.json();

// data.gates = [
//   { id: 1, name: 'Premium Features', slug: 'premium-features', active: true },
//   { id: 2, name: 'Beta Access', slug: 'beta-access', active: true },
// ]
```

### Step 2: Store Gates in State

**React (Zustand):**

```typescript
interface AuthState {
  user: User | null;
  gates: Gate[];
  hasGate: (slug: string) => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  gates: [],

  hasGate: (slug: string) => {
    return get().gates.some(
      gate => gate.slug === slug && gate.active
    );
  },

  setUser: (user: User, gates: Gate[]) => {
    set({ user, gates });
  },
}));
```

**React (Context):**

```typescript
interface GateContextType {
  gates: Gate[];
  hasGate: (slug: string) => boolean;
}

const GateContext = createContext<GateContextType | undefined>(undefined);

export function GateProvider({ children }: { children: React.ReactNode }) {
  const [gates, setGates] = useState<Gate[]>([]);

  const hasGate = useCallback((slug: string) => {
    return gates.some(gate => gate.slug === slug && gate.active);
  }, [gates]);

  return (
    <GateContext.Provider value={{ gates, hasGate }}>
      {children}
    </GateContext.Provider>
  );
}

export const useGates = () => {
  const context = useContext(GateContext);
  if (!context) {
    throw new Error('useGates must be used within GateProvider');
  }
  return context;
};
```

### Step 3: Conditional Rendering

**Simple Check:**

```tsx
function Dashboard() {
  const { hasGate } = useAuth();

  return (
    <div>
      <h1>Dashboard</h1>
      
      {hasGate('premium-features') && (
        <PremiumSection />
      )}
      
      {hasGate('advanced-analytics') && (
        <AdvancedAnalytics />
      )}
      
      {hasGate('beta-access') && (
        <BetaBadge />
      )}
    </div>
  );
}
```

**Component Wrapper:**

```tsx
interface GatedProps {
  gate: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

function Gated({ gate, fallback, children }: GatedProps) {
  const { hasGate } = useAuth();

  if (!hasGate(gate)) {
    return fallback || null;
  }

  return <>{children}</>;
}

// Usage
<Gated gate="premium-features" fallback={<UpgradePrompt />}>
  <PremiumFeature />
</Gated>
```

**Multiple Gates (AND logic):**

```tsx
function MultiGated({ gates, children }: { gates: string[]; children: React.ReactNode }) {
  const { hasGate } = useAuth();

  const hasAllGates = gates.every(gate => hasGate(gate));

  return hasAllGates ? <>{children}</> : null;
}

// Usage
<MultiGated gates={['premium-features', 'advanced-analytics']}>
  <SuperPremiumFeature />
</MultiGated>
```

**Multiple Gates (OR logic):**

```tsx
function AnyGated({ gates, children }: { gates: string[]; children: React.ReactNode }) {
  const { hasGate } = useAuth();

  const hasAnyGate = gates.some(gate => hasGate(gate));

  return hasAnyGate ? <>{children}</> : null;
}
```

### Step 4: Route Protection

**React Router:**

```tsx
function ProtectedRoute({ gate, children }: { gate: string; children: React.ReactNode }) {
  const { hasGate } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hasGate(gate)) {
      navigate('/upgrade');
    }
  }, [hasGate, gate, navigate]);

  return hasGate(gate) ? <>{children}</> : null;
}

// Usage in routes
<Route path="/premium" element={
  <ProtectedRoute gate="premium-features">
    <PremiumPage />
  </ProtectedRoute>
} />
```

---

## Best Practices

### 1. Naming Consistency

Use consistent, descriptive names across your application:

```typescript
// ✅ Good
'premium-features', 'advanced-analytics', 'beta-access'

// ❌ Bad
'feature1', 'new_thing', 'testFeature'
```

### 2. Check Both Gate and Active Status

Always verify the gate is active:

```typescript
// ✅ Good
const hasAccess = user.gates.some(
  gate => gate.slug === 'premium' && gate.active
);

// ❌ Bad - doesn't check active status
const hasAccess = user.gates.some(gate => gate.slug === 'premium');
```

### 3. Graceful Degradation

Provide alternatives when gates are not available:

```tsx
{hasGate('advanced-charts') ? (
  <AdvancedChartComponent />
) : (
  <BasicChartComponent />
)}
```

### 4. Document Gate Purpose

Maintain a registry of gates and their purposes:

```typescript
// gates.registry.ts
export const GATES = {
  PREMIUM_FEATURES: {
    slug: 'premium-features',
    description: 'Access to premium features (export, advanced filters)',
    requiredFor: ['data export', 'custom reports', 'priority support'],
  },
  BETA_ACCESS: {
    slug: 'beta-access',
    description: 'Early access to beta features',
    requiredFor: ['new dashboard', 'AI insights'],
  },
  ADVANCED_ANALYTICS: {
    slug: 'advanced-analytics',
    description: 'Advanced analytics and reporting',
    requiredFor: ['custom metrics', 'trend analysis', 'forecasting'],
  },
} as const;
```

### 5. Use Level for Tiering

Use the `level` field for feature tiers:

```typescript
// Level 0: Free tier (no gates needed)
// Level 10: Basic subscription
// Level 20: Professional subscription
// Level 30: Enterprise subscription

await prisma.gate.create({
  data: {
    name: 'Enterprise API Access',
    slug: 'enterprise-api',
    active: true,
    level: 30,
  },
});
```

### 6. Audit Gate Changes

Always log gate assignments for compliance:

```typescript
await this.auditLogService.log({
  action: 'gate_assigned',
  userId: user.id,
  actorId: admin.id,
  metadata: {
    gateName: gate.name,
    gateSlug: gate.slug,
    reason: 'Subscription upgrade',
  },
});
```

### 7. Separate Backend and Frontend Logic

**Backend:** Focus on security and access control
**Frontend:** Focus on UX and progressive enhancement

```typescript
// Backend: Hard security check
if (!hasGate('premium')) {
  throw new ForbiddenException('Premium required');
}

// Frontend: Show/hide UI elements
{hasGate('premium') && <PremiumButton />}
```

---

## Common Use Cases

### 1. Subscription-Based Features

```typescript
// Assign premium gate on subscription
async onSubscriptionActivated(userId: number) {
  await this.assignGate(userId, 'premium-features');
  await this.assignGate(userId, 'advanced-analytics');
  await this.assignGate(userId, 'data-export');
}

// Remove gates on cancellation
async onSubscriptionCancelled(userId: number) {
  await this.removeGate(userId, 'premium-features');
  await this.removeGate(userId, 'advanced-analytics');
  await this.removeGate(userId, 'data-export');
}
```

### 2. Beta Testing

```typescript
// Grant beta access to specific users
const betaUsers = [123, 456, 789];
await this.assignGateToUsers('beta-access', betaUsers);

// Frontend: Show beta badge
{hasGate('beta-access') && <BetaBadge />}
```

### 3. Gradual Rollout

```typescript
// Rollout to 10% of users
async rolloutToPercentage(gateSlug: string, percentage: number) {
  const allUsers = await this.prisma.user.findMany({
    select: { id: true },
  });

  const sampleSize = Math.floor(allUsers.length * (percentage / 100));
  const selectedUsers = allUsers
    .sort(() => Math.random() - 0.5)
    .slice(0, sampleSize);

  await this.assignGateToUsers(
    gateSlug,
    selectedUsers.map(u => u.id)
  );
}

// Usage
await this.rolloutToPercentage('new-dashboard', 10); // 10% rollout
```

### 4. Emergency Feature Disable

```typescript
// Disable a problematic feature globally
await prisma.gate.update({
  where: { slug: 'new-feature' },
  data: { active: false },
});

// All users lose access immediately (when they check)
```

### 5. Geographic Restrictions

```typescript
// Combine gates with user metadata
async checkFeatureAccess(user: ITokenUser, featureSlug: string) {
  const hasGate = user.gates.some(
    g => g.slug === featureSlug && g.active
  );

  // Additional checks
  const userDetails = await this.prisma.user.findUnique({
    where: { id: user.id },
  });

  const isAllowedRegion = ['US', 'CA', 'UK'].includes(
    userDetails.meta?.country
  );

  return hasGate && isAllowedRegion;
}
```

---

## Gate Lifecycle

### 1. Creation
- Define gate purpose and slug
- Create via API or database
- Document in gate registry

### 2. Testing
- Assign to test users
- Verify backend checks
- Test frontend rendering
- Check audit logs

### 3. Rollout
- Start with small percentage
- Monitor for errors
- Gradually increase percentage
- Reach 100% or target group

### 4. Maintenance
- Monitor usage via dashboard
- Review audit logs
- Update documentation
- Adjust access as needed

### 5. Deprecation
- Announce removal timeline
- Migrate users to new system
- Set `active: false`
- Eventually delete gate

---

## Examples

### Example 1: Premium Analytics Dashboard

**Backend:**

```typescript
@Get('analytics/advanced')
@UseGuards(RolesGuard)
async getAdvancedAnalytics(@CurrentUser() user: ITokenUser) {
  const hasPremium = user.gates?.some(
    g => g.slug === 'advanced-analytics' && g.active
  );

  if (!hasPremium) {
    throw new ForbiddenException('Premium subscription required');
  }

  return this.analyticsService.getAdvancedMetrics(user.id);
}
```

**Frontend:**

```tsx
function AnalyticsDashboard() {
  const { hasGate } = useAuth();

  return (
    <div>
      <h1>Analytics</h1>
      
      {/* Always show basic metrics */}
      <BasicMetrics />
      
      {/* Conditional premium features */}
      {hasGate('advanced-analytics') ? (
        <>
          <TrendAnalysis />
          <Forecasting />
          <CustomReports />
        </>
      ) : (
        <UpgradePrompt feature="Advanced Analytics" />
      )}
    </div>
  );
}
```

### Example 2: Data Export Feature

**Backend:**

```typescript
@Post('data/export')
@UseGuards(RolesGuard)
@Audit('data_export')
async exportData(
  @CurrentUser() user: ITokenUser,
  @Body() options: ExportOptionsDto,
) {
  await this.gateChecker.requireGate(user.id, 'data-export');

  const data = await this.dataService.getUserData(user.id);
  const exported = await this.exportService.export(data, options.format);

  return { downloadUrl: exported.url };
}
```

**Frontend:**

```tsx
function DataTable() {
  const { hasGate } = useAuth();

  return (
    <div>
      <Table data={data} />
      
      <Gated gate="data-export" fallback={
        <button disabled>
          Export (Premium Only)
        </button>
      }>
        <button onClick={handleExport}>
          Export Data
        </button>
      </Gated>
    </div>
  );
}
```

---

## Monitoring and Analytics

### Track Gate Usage

```typescript
@Get('admin/gate-analytics')
@Roles('admin')
async getGateAnalytics() {
  const gates = await this.prisma.gate.findMany({
    include: {
      _count: {
        select: { users: true },
      },
    },
  });

  return gates.map(gate => ({
    name: gate.name,
    slug: gate.slug,
    active: gate.active,
    userCount: gate._count.users,
    adoptionRate: (gate._count.users / totalUsers) * 100,
  }));
}
```

### Log Feature Usage

```typescript
// Track when gated features are used
async trackFeatureUsage(userId: number, featureSlug: string) {
  await this.prisma.featureUsage.create({
    data: {
      userId,
      feature: featureSlug,
      timestamp: new Date(),
    },
  });
}
```

---

## Troubleshooting

### Gate Not Working

1. **Check gate is active:**
   ```typescript
   const gate = await prisma.gate.findUnique({
     where: { slug: 'your-gate' },
   });
   console.log('Gate active:', gate.active);
   ```

2. **Verify user has gate:**
   ```typescript
   const userGates = await prisma.userGate.findMany({
     where: { user_id: userId },
     include: { gate: true },
   });
   console.log('User gates:', userGates);
   ```

3. **Check frontend state:**
   ```typescript
   console.log('User gates from API:', user.gates);
   console.log('Has gate check:', hasGate('your-gate'));
   ```

### Gate Assignment Failed

Check audit logs:
```typescript
const logs = await prisma.auditLog.findMany({
  where: {
    userId,
    action: { in: ['gate_assigned', 'gate_removed'] },
  },
  orderBy: { createdAt: 'desc' },
});
```

---

## Summary

Gates provide a flexible, secure way to control feature access in your application. Key takeaways:

- ✅ Use descriptive slugs and names
- ✅ Always check `active` status
- ✅ Implement both backend and frontend checks
- ✅ Log gate assignments for audit trail
- ✅ Document gates and their purposes
- ✅ Test thoroughly before production rollout

For more information, see:
- [Client Integration Guide](./CLIENT_INTEGRATION_GUIDE.md)
- [API Documentation](./API_REFERENCE.md)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)

---

**Last Updated:** February 4, 2026
