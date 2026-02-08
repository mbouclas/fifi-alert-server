import { Injectable, Logger } from '@nestjs/common';
import { ApiClient } from '../utils/api-client.js';
import { SimulationLogger } from '../utils/simulation-logger.js';
import { DatabaseSeeder } from '../utils/database-seeder.js';
import {
  IScenario,
  SimulationState,
} from '../interfaces/scenario.interface.js';

/**
 * Scenario 1: Register a New User
 *
 * This scenario:
 * 1. Registers a new user via POST /auth/signup
 * 2. Assigns the "User" role to the newly created user
 * 3. Logs the response
 */
@Injectable()
export class RegisterUserScenario implements IScenario {
  private readonly logger = new Logger(RegisterUserScenario.name);

  constructor(
    private readonly apiClient: ApiClient,
    private readonly simulationLogger: SimulationLogger,
    private readonly databaseSeeder: DatabaseSeeder,
  ) {}

  async execute(state: SimulationState): Promise<Partial<SimulationState>> {
    this.logger.log('Executing: Register User');

    try {
      // Step 1: Register the user via API
      const registerPayload = {
        email: state.email,
        password: state.password,
        name: `${state.firstName} ${state.lastName}`,
      };

      const response = await this.apiClient.post(
        '/auth/signup',
        registerPayload,
      );

      // Step 2: Assign "User" role to the newly created user
      const userId = Number(response.data.user.id);
      const prisma = this.databaseSeeder.getPrismaClient();

      // Find the "User" role
      const userRole = await prisma.role.findUnique({
        where: { slug: 'user' },
      });

      if (!userRole) {
        throw new Error('User role not found in database');
      }

      // Assign role to user
      await prisma.userRole.create({
        data: {
          user_id: userId,
          role_id: userRole.id,
        },
      });

      this.logger.log(`Assigned "User" role to user ${userId}`);

      // Log the scenario result
      await this.simulationLogger.logScenario('01-register-user', {
        request: registerPayload,
        response: response.data,
        status: response.status,
        userId,
        roleAssigned: 'User',
      });

      return {
        userId,
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
      };
    } catch (error) {
      this.logger.error('Register User scenario failed', error);
      await this.simulationLogger.logError('01-register-user', error);
      throw error;
    }
  }
}
