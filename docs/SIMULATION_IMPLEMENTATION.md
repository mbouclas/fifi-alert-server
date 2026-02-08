# Simulation Implementation Summary

## Overview
Implemented a comprehensive simulation system for the CLI `simulate` command that:
- Uses the shadow database (`SHADOW_DATABASE_URL`)
- Makes API calls using fetch (like a real client)
- Logs each scenario to separate files under `/logs/simulations/{timestamp}/`
- Executes scenarios sequentially with shared state
- Seeds database with initial roles and gates

## Implementation Structure

### Module Organization
```
src/simulation/
├── simulation.module.ts          # Module definition with all providers
├── simulation.service.ts         # Orchestrates scenario execution
├── interfaces/
│   └── scenario.interface.ts     # IScenario interface & SimulationState type
├── scenarios/                    # Each scenario in a separate file
│   ├── 01-register-user.scenario.ts
│   ├── 02-login-user.scenario.ts
│   ├── 03-create-alert.scenario.ts
│   ├── 04-list-alerts.scenario.ts
│   └── 05-logout-user.scenario.ts
└── utils/                        # Reusable utilities (DRY)
    ├── api-client.ts             # HTTP client using fetch
    ├── database-seeder.ts        # Seeds roles & gates to shadow DB
    └── simulation-logger.ts      # Logs scenarios to files
```

### Files Created

1. **Module & Service**
   - `src/simulation/simulation.module.ts` - Module with all dependencies
   - `src/simulation/simulation.service.ts` - Orchestrates scenario execution

2. **Utilities**
   - `src/simulation/utils/api-client.ts` - Fetch-based HTTP client
   - `src/simulation/utils/database-seeder.ts` - Seeds shadow database
   - `src/simulation/utils/simulation-logger.ts` - File-based logging

3. **Scenarios** (each in separate file)
   - `src/simulation/scenarios/01-register-user.scenario.ts`
   - `src/simulation/scenarios/02-login-user.scenario.ts`
   - `src/simulation/scenarios/03-create-alert.scenario.ts`
   - `src/simulation/scenarios/04-list-alerts.scenario.ts`
   - `src/simulation/scenarios/05-logout-user.scenario.ts`

4. **Interface**
   - `src/simulation/interfaces/scenario.interface.ts` - IScenario interface

5. **Documentation**
   - `src/simulation/README.md` - Module documentation
   - `logs/simulations/README.md` - Log format documentation

### Files Modified

1. **CLI Integration**
   - `src/commands/simulate.command.ts` - Updated to use SimulationService
   - `src/commands/commands.module.ts` - Added SimulationModule import
   - `src/cli.module.ts` - Added SimulationModule to imports

## Database Seeding

The simulation automatically seeds the shadow database with:

### Roles
- **User** (slug: `user`, level: 1)
- **Admin** (slug: `admin`, level: 10)

### Gates
- **user.profile.edit** (slug: `user.profile.edit`)
- **user.profile.delete** (slug: `user.profile.delete`)

## Scenario Execution Order

1. **Register User** - Creates user and assigns "User" role
2. **Login User** - Authenticates with created credentials
3. **Create Alert** - Creates a missing pet alert (authenticated)
4. **List Alerts** - Retrieves alerts near the created alert location
5. **Logout User** - Logs out and clears tokens

## Key Features

### 1. Shadow Database Usage
- Uses `SHADOW_DATABASE_URL` environment variable
- Connects via Prisma with pg adapter
- Isolated from dev/prod databases

### 2. API Client as Real Client
- Uses native `fetch` API
- Sends JSON payloads
- Handles authentication headers (`Bearer` token)
- Supports GET, POST, PATCH, DELETE methods

### 3. Separate Log Files
Each scenario logs to its own file:
- `01-register-user.json`
- `02-login-user.json`
- `03-create-alert.json`
- `04-list-alerts.json`
- `05-logout-user.json`
- `*-error.json` (if scenario fails)

Plus session metadata:
- `_session-metadata.json` (start/end time, duration, status)

### 4. DRY Code Organization
- **Shared utilities** - ApiClient, SimulationLogger, DatabaseSeeder
- **Scenario interface** - All scenarios implement IScenario
- **State management** - Shared SimulationState passed between scenarios
- **Reusable components** - Each utility can be used independently

### 5. Clean Separation
- Each scenario is in its own file
- Scenarios are independent and testable
- Module-based architecture
- Clear dependency injection

## Usage

```bash
# Run the simulation
bun run cli simulate
```

This will:
1. Create timestamped log directory: `/logs/simulations/{timestamp}/`
2. Seed shadow database with roles & gates
3. Execute 5 scenarios sequentially
4. Log each scenario to separate file
5. Write session metadata

## Log Output Example

```
logs/simulations/
└── 2026-02-07T10-30-00-000Z/
    ├── _session-metadata.json
    ├── 01-register-user.json
    ├── 02-login-user.json
    ├── 03-create-alert.json
    ├── 04-list-alerts.json
    └── 05-logout-user.json
```

Each log file contains:
- `scenario` - Scenario name
- `timestamp` - Execution time
- `request` - Request payload
- `response` - API response
- `status` - HTTP status code
- Additional scenario-specific data

## Technical Details

### Module Resolution
- Uses `.js` extensions for local imports (nodenext module resolution)
- Uses path aliases for shared modules (`@shared`, `@prisma-lib`, etc.)

### Error Handling
- Scenarios catch and log errors to `*-error.json` files
- Errors stop execution and fail the simulation
- Session metadata records failure status

### State Flow
```typescript
interface SimulationState {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  accessToken: string;
  refreshToken: string;
  userId: number;
  alertId: number;
}
```

State flows between scenarios:
1. Register → userId, accessToken, refreshToken
2. Login → updated accessToken, refreshToken
3. Create Alert → alertId
4. List Alerts → (verification only)
5. Logout → clears tokens

## Adding New Scenarios

1. Create scenario file: `src/simulation/scenarios/06-my-scenario.scenario.ts`
2. Implement `IScenario` interface
3. Register in `simulation.module.ts`
4. Add to execution order in `simulation.service.ts`

See `src/simulation/README.md` for detailed instructions.

## Benefits

✅ **Clean code** - DRY principles, single responsibility
✅ **Testable** - Each scenario is independent and testable
✅ **Observable** - Detailed logs for debugging
✅ **Extensible** - Easy to add new scenarios
✅ **Realistic** - Uses real API endpoints via fetch
✅ **Safe** - Isolated shadow database
✅ **Documented** - README files in key locations

## Next Steps

- Add more scenarios as needed
- Consider adding performance metrics
- Add retry logic for flaky scenarios
- Create CI/CD integration for automated testing
