import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SimulationLogger } from './utils/simulation-logger.js';
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
 * Simulation Service
 *
 * Orchestrates the execution of simulation scenarios in order.
 * This service:
 * 1. Seeds the database with initial data (roles, gates)
 * 2. Executes scenarios sequentially
 * 3. Manages shared state between scenarios
 * 4. Logs results to separate files
 */
@Injectable()
export class SimulationService {
  private readonly logger = new Logger(SimulationService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly simulationLogger: SimulationLogger,
    private readonly databaseSeeder: DatabaseSeeder,
    private readonly registerUserScenario: RegisterUserScenario,
    private readonly loginUserScenario: LoginUserScenario,
    private readonly createAlertScenario: CreateAlertScenario,
    private readonly listAlertsScenario: ListAlertsScenario,
    private readonly logoutUserScenario: LogoutUserScenario,
    private readonly registerPetsScenario: RegisterPetsScenario,
    private readonly listPetsScenario: ListPetsScenario,
    private readonly createAlertZonesScenario: CreateAlertZonesScenario,
    private readonly listAlertZonesScenario: ListAlertZonesScenario,
  ) {
    const port = this.configService.get<number>('PORT', 3000);
    this.baseUrl = `http://localhost:${port}`;
  }

  /**
   * Run all simulation scenarios
   */
  async runSimulation(): Promise<void> {
    const sessionId = await this.simulationLogger.startSession();
    this.logger.log(`🎭 Starting simulation session: ${sessionId}`);

    try {
      // Step 0: Seed database with roles and gates
      this.logger.log('📦 Seeding database...');
      await this.databaseSeeder.seed();
      this.logger.log('✅ Database seeded successfully');

      // Shared state between scenarios
      const state = {
        email: `testuser_${Date.now()}@example.com`,
        password: 'Test1234!',
        firstName: 'Test',
        lastName: 'User',
        accessToken: '',
        refreshToken: '',
        userId: 0,
        alertId: 0,
      };

      // Scenario 1: Register a new user
      this.logger.log('1️⃣ Running scenario: Register User...');
      const registerResult = await this.registerUserScenario.execute(state);
      Object.assign(state, registerResult);
      this.logger.log('✅ Scenario 1 completed');

      // Scenario 2: Login the user
      this.logger.log('2️⃣ Running scenario: Login User...');
      const loginResult = await this.loginUserScenario.execute(state);
      Object.assign(state, loginResult);
      this.logger.log('✅ Scenario 2 completed');

      // Scenario 3: Register two pets
      this.logger.log('3️⃣ Running scenario: Register Two Pets...');
      const registerPetsResult = await this.registerPetsScenario.execute(state);
      Object.assign(state, registerPetsResult);
      this.logger.log('✅ Scenario 3 completed');

      // Scenario 4: List user's pets
      this.logger.log('4️⃣ Running scenario: List Pets...');
      await this.listPetsScenario.execute(state);
      this.logger.log('✅ Scenario 4 completed');

      // Scenario 5: Create a new alert
      this.logger.log('5️⃣ Running scenario: Create Alert...');
      const createAlertResult = await this.createAlertScenario.execute(state);
      Object.assign(state, createAlertResult);
      this.logger.log('✅ Scenario 5 completed');

      // Scenario 6: List all alerts
      this.logger.log('6️⃣ Running scenario: List Alerts...');
      await this.listAlertsScenario.execute(state);
      this.logger.log('✅ Scenario 6 completed');

      // Scenario 7: Logout
      this.logger.log('7️⃣ Running scenario: Logout User...');
      await this.logoutUserScenario.execute(state);
      this.logger.log('✅ Scenario 7 completed');

      this.logger.log('🎉 All scenarios completed successfully!');

      await this.simulationLogger.endSession(
        'All scenarios completed successfully',
      );
    } catch (error) {
      this.logger.error('❌ Simulation failed', error.message);
      await this.simulationLogger.endSession(`Failed: ${error.message}`);
      throw error;
    }
  }
}
