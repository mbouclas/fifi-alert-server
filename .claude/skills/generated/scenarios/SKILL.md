---
name: scenarios
description: "Skill for the Scenarios area of fifi-alert-server. 10 symbols across 10 files."
---

# Scenarios

10 symbols | 10 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how ListAlertZonesScenario, CreateAlertZonesScenario, ListPetsScenario work
- Modifying scenarios-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/simulation/scenarios/09-list-alert-zones.scenario.ts` | ListAlertZonesScenario |
| `src/simulation/scenarios/08-create-alert-zones.scenario.ts` | CreateAlertZonesScenario |
| `src/simulation/scenarios/07-list-pets.scenario.ts` | ListPetsScenario |
| `src/simulation/scenarios/06-register-pets.scenario.ts` | RegisterPetsScenario |
| `src/simulation/scenarios/05-logout-user.scenario.ts` | LogoutUserScenario |
| `src/simulation/scenarios/04-list-alerts.scenario.ts` | ListAlertsScenario |
| `src/simulation/scenarios/03-create-alert.scenario.ts` | CreateAlertScenario |
| `src/simulation/scenarios/02-login-user.scenario.ts` | LoginUserScenario |
| `src/simulation/scenarios/01-register-user.scenario.ts` | RegisterUserScenario |
| `src/simulation/interfaces/scenario.interface.ts` | IScenario |

## Entry Points

Start here when exploring this area:

- **`ListAlertZonesScenario`** (Class) — `src/simulation/scenarios/09-list-alert-zones.scenario.ts:17`
- **`CreateAlertZonesScenario`** (Class) — `src/simulation/scenarios/08-create-alert-zones.scenario.ts:18`
- **`ListPetsScenario`** (Class) — `src/simulation/scenarios/07-list-pets.scenario.ts:17`
- **`RegisterPetsScenario`** (Class) — `src/simulation/scenarios/06-register-pets.scenario.ts:18`
- **`LogoutUserScenario`** (Class) — `src/simulation/scenarios/05-logout-user.scenario.ts:17`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `ListAlertZonesScenario` | Class | `src/simulation/scenarios/09-list-alert-zones.scenario.ts` | 17 |
| `CreateAlertZonesScenario` | Class | `src/simulation/scenarios/08-create-alert-zones.scenario.ts` | 18 |
| `ListPetsScenario` | Class | `src/simulation/scenarios/07-list-pets.scenario.ts` | 17 |
| `RegisterPetsScenario` | Class | `src/simulation/scenarios/06-register-pets.scenario.ts` | 18 |
| `LogoutUserScenario` | Class | `src/simulation/scenarios/05-logout-user.scenario.ts` | 17 |
| `ListAlertsScenario` | Class | `src/simulation/scenarios/04-list-alerts.scenario.ts` | 17 |
| `CreateAlertScenario` | Class | `src/simulation/scenarios/03-create-alert.scenario.ts` | 17 |
| `LoginUserScenario` | Class | `src/simulation/scenarios/02-login-user.scenario.ts` | 17 |
| `RegisterUserScenario` | Class | `src/simulation/scenarios/01-register-user.scenario.ts` | 18 |
| `IScenario` | Interface | `src/simulation/interfaces/scenario.interface.ts` | 22 |

## How to Explore

1. `gitnexus_context({name: "ListAlertZonesScenario"})` — see callers and callees
2. `gitnexus_query({query: "scenarios"})` — find related execution flows
3. Read key files listed above for implementation details
