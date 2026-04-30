import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module.js';
import { SimulationService } from './simulation.service.js';
import { SimulationLogger } from './utils/simulation-logger.js';
import { ApiClient } from './utils/api-client.js';
import { DatabaseSeeder } from './utils/database-seeder.js';
import { RegisterUserScenario } from './scenarios/01-register-user.scenario.js';
import { LoginUserScenario } from './scenarios/02-login-user.scenario.js';
import { CreateAlertScenario } from './scenarios/03-create-alert.scenario.js';
import { ListAlertsScenario } from './scenarios/04-list-alerts.scenario.js';
import { LogoutUserScenario } from './scenarios/05-logout-user.scenario.js';
import { RegisterPetsScenario } from './scenarios/06-register-pets.scenario.js';
import { ListPetsScenario } from './scenarios/07-list-pets.scenario.js';
import { CreateAlertZonesScenario } from './scenarios/08-create-alert-zones.scenario.js';
import { ListAlertZonesScenario } from './scenarios/09-list-alert-zones.scenario.js';

/**
 * Simulation Module
 *
 * This module contains all simulation-related functionality including:
 * - Scenario implementations
 * - API client for making HTTP requests
 * - Database seeding utilities
 * - Logging utilities
 */
@Module({
  imports: [SharedModule],
  providers: [
    SimulationService,
    SimulationLogger,
    ApiClient,
    DatabaseSeeder,
    RegisterUserScenario,
    LoginUserScenario,
    CreateAlertScenario,
    ListAlertsScenario,
    LogoutUserScenario,
    RegisterPetsScenario,
    ListPetsScenario,
    CreateAlertZonesScenario,
    ListAlertZonesScenario,
  ],
  exports: [SimulationService],
})
export class SimulationModule { }
