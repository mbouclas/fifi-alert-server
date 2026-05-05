---
name: scripts
description: "Skill for the Scripts area of fifi-alert-server. 16 symbols across 2 files."
---

# Scripts

16 symbols | 2 files | Cohesion: 100%

## When to Use

- Working with code in `scripts/`
- Understanding how testAlertZoneQuery, getQueryPlan, checkGistIndexUsed work
- Modifying scripts-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `scripts/test-alert-zone-performance.ts` | testAlertZoneQuery, getQueryPlan, checkGistIndexUsed, createTestData, cleanupTestData (+4) |
| `scripts/performance-test.ts` | calculatePercentile, calculateMetrics, printMetrics, testAlertCreationPerformance, testGeospatialQueryPerformance (+2) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `testAlertZoneQuery` | Function | `scripts/test-alert-zone-performance.ts` | 36 |
| `getQueryPlan` | Function | `scripts/test-alert-zone-performance.ts` | 77 |
| `checkGistIndexUsed` | Function | `scripts/test-alert-zone-performance.ts` | 113 |
| `createTestData` | Function | `scripts/test-alert-zone-performance.ts` | 125 |
| `cleanupTestData` | Function | `scripts/test-alert-zone-performance.ts` | 188 |
| `runPerformanceTests` | Function | `scripts/test-alert-zone-performance.ts` | 203 |
| `printSummary` | Function | `scripts/test-alert-zone-performance.ts` | 287 |
| `verifyIndexes` | Function | `scripts/test-alert-zone-performance.ts` | 350 |
| `main` | Function | `scripts/test-alert-zone-performance.ts` | 393 |
| `calculatePercentile` | Function | `scripts/performance-test.ts` | 36 |
| `calculateMetrics` | Function | `scripts/performance-test.ts` | 44 |
| `printMetrics` | Function | `scripts/performance-test.ts` | 62 |
| `testAlertCreationPerformance` | Function | `scripts/performance-test.ts` | 88 |
| `testGeospatialQueryPerformance` | Function | `scripts/performance-test.ts` | 188 |
| `testNotificationTargetingPerformance` | Function | `scripts/performance-test.ts` | 325 |
| `main` | Function | `scripts/performance-test.ts` | 453 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Main → CalculatePercentile` | intra_community | 4 |
| `Main → TestAlertZoneQuery` | intra_community | 3 |
| `Main → GetQueryPlan` | intra_community | 3 |
| `Main → CheckGistIndexUsed` | intra_community | 3 |
| `Main → CreateTestData` | intra_community | 3 |
| `Main → PrintMetrics` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "testAlertZoneQuery"})` — see callers and callees
2. `gitnexus_query({query: "scripts"})` — find related execution flows
3. Read key files listed above for implementation details
