---
name: health
description: "Skill for the Health area of fifi-alert-server. 6 symbols across 1 files."
---

# Health

6 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how checkHealth, checkDatabase, checkRedis work
- Modifying health-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/health/health.service.ts` | checkHealth, checkDatabase, checkRedis, checkDisk, getDiskSpace (+1) |

## Entry Points

Start here when exploring this area:

- **`checkHealth`** (Method) — `src/health/health.service.ts:89`
- **`checkDatabase`** (Method) — `src/health/health.service.ts:138`
- **`checkRedis`** (Method) — `src/health/health.service.ts:165`
- **`checkDisk`** (Method) — `src/health/health.service.ts:203`
- **`getDiskSpace`** (Method) — `src/health/health.service.ts:253`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `checkHealth` | Method | `src/health/health.service.ts` | 89 |
| `checkDatabase` | Method | `src/health/health.service.ts` | 138 |
| `checkRedis` | Method | `src/health/health.service.ts` | 165 |
| `checkDisk` | Method | `src/health/health.service.ts` | 203 |
| `getDiskSpace` | Method | `src/health/health.service.ts` | 253 |
| `checkEmail` | Method | `src/health/health.service.ts` | 289 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CheckHealth → GetDiskSpace` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "checkHealth"})` — see callers and callees
2. `gitnexus_query({query: "health"})` — find related execution flows
3. Read key files listed above for implementation details
