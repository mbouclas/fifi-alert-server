# Simulation Module

This module provides end-to-end scenario testing functionality for the FiFi Alert API.

## Overview

The simulation module:

- Uses the **shadow database** (via `SHADOW_DATABASE_URL`)
- Makes API requests via **fetch** (like a real client)
- Logs each scenario to **separate files** in `/logs/simulations/{timestamp}/`
- Executes scenarios **sequentially** with shared state

## Architecture

```
simulation/
├── simulation.module.ts          # Module definition
├── simulation.service.ts         # Orchestrates scenario execution
├── interfaces/
│   └── scenario.interface.ts     # Scenario interface and state type
├── scenarios/
│   ├── 01-register-user.scenario.ts
│   ├── 02-login-user.scenario.ts
│   ├── 03-create-alert.scenario.ts
│   ├── 04-list-alerts.scenario.ts
│   └── 05-logout-user.scenario.ts
└── utils/
    ├── api-client.ts             # HTTP client using fetch
    ├── database-seeder.ts        # Seeds roles and gates
    └── simulation-logger.ts      # Logs scenarios to files
```

## Usage

Run the simulation:

```bash
bun run cli simulate
```

Run only the account verification flow simulation:

```bash
bun run src/simulation/account-verification-flow.ts
```

This will:

1. Seed the shadow database with roles and gates
2. Execute 5 scenarios in order
3. Write logs to `/logs/simulations/{timestamp}/`

The account verification flow script creates a user via `UserService.store`,
captures the Better Auth verification URL emitted by the email event, confirms
login is blocked before verification, verifies the token, and confirms login
succeeds after `email_verified` is set.

## Scenarios

### 1. Register User

- Calls `POST /auth/signup`
- Assigns "User" role to the created user
- Returns `userId`, `accessToken`, `refreshToken`

### 2. Login User

- Calls `POST /auth/login`
- Uses credentials from scenario 1
- Returns updated `accessToken`, `refreshToken`

### 3. Create Alert

- Calls `POST /alerts`
- Uses access token from scenario 2
- Creates a missing dog alert
- Returns `alertId`

### 4. List Alerts

- Calls `GET /alerts?lat=...&lon=...&radiusKm=...`
- Verifies alert from scenario 3 is in the list
- No authentication required

### 5. Logout User

- Calls `POST /auth/logout`
- Uses access token from scenario 2
- Clears tokens from state

## Adding New Scenarios

1. Create a new scenario file in `scenarios/`:

   ```typescript
   import { Injectable, Logger } from '@nestjs/common';
   import { ApiClient } from '../utils/api-client';
   import { SimulationLogger } from '../utils/simulation-logger';
   import {
     IScenario,
     SimulationState,
   } from '../interfaces/scenario.interface';

   @Injectable()
   export class MyNewScenario implements IScenario {
     constructor(
       private readonly apiClient: ApiClient,
       private readonly simulationLogger: SimulationLogger,
     ) {}

     async execute(state: SimulationState): Promise<Partial<SimulationState>> {
       // Make API calls
       const response = await this.apiClient.get('/my-endpoint');

       // Log results
       await this.simulationLogger.logScenario('06-my-scenario', {
         response: response.data,
       });

       // Return updated state
       return { someNewField: 'value' };
     }
   }
   ```

2. Register the scenario in `simulation.module.ts`:

   ```typescript
   import { MyNewScenario } from './scenarios/06-my-new-scenario';

   @Module({
     providers: [..., MyNewScenario],
   })
   ```

3. Add to execution order in `simulation.service.ts`:

   ```typescript
   constructor(
     // ...
     private readonly myNewScenario: MyNewScenario,
   ) {}

   async runSimulation() {
     // ...
     const result = await this.myNewScenario.execute(state);
     Object.assign(state, result);
   }
   ```

## Database Seeding

The `DatabaseSeeder` automatically seeds:

### Roles

- **User** (slug: `user`, level: 1)
- **Admin** (slug: `admin`, level: 10)

### Gates

- **user.profile.edit** (slug: `user.profile.edit`)
- **user.profile.delete** (slug: `user.profile.delete`)

## Logs

Each simulation run creates:

- `_session-metadata.json` - Start/end time, duration, status
- `{scenario-name}.json` - Scenario request/response logs
- `{scenario-name}-error.json` - Error logs (if scenario fails)

## Notes

- **DRY Principle**: Shared utilities (API client, logger, seeder) are reusable
- **State Management**: State flows between scenarios via `SimulationState`
- **Error Handling**: Errors stop execution and log to `*-error.json` files
- **Shadow Database**: Always uses `SHADOW_DATABASE_URL` to avoid affecting dev/prod data
