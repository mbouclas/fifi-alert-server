import { Injectable, Logger } from '@nestjs/common';
import { ApiClient } from '../utils/api-client.js';
import { SimulationLogger } from '../utils/simulation-logger.js';
import {
  IScenario,
  SimulationState,
} from '../interfaces/scenario.interface.js';

/**
 * Scenario 5: Logout User
 *
 * This scenario:
 * 1. Logs out the user via POST /auth/logout
 * 2. Uses the access token from login
 * 3. Logs the response
 */
@Injectable()
export class LogoutUserScenario implements IScenario {
  private readonly logger = new Logger(LogoutUserScenario.name);

  constructor(
    private readonly apiClient: ApiClient,
    private readonly simulationLogger: SimulationLogger,
  ) {}

  async execute(state: SimulationState): Promise<Partial<SimulationState>> {
    this.logger.log('Executing: Logout User');

    try {
      const response = await this.apiClient.post(
        '/auth/logout',
        {},
        { token: state.accessToken },
      );

      // Log the scenario result
      await this.simulationLogger.logScenario('05-logout-user', {
        status: response.status,
        response: response.data,
      });

      return {
        accessToken: '',
        refreshToken: '',
      };
    } catch (error) {
      this.logger.error('Logout User scenario failed', error);
      await this.simulationLogger.logError('05-logout-user', error);
      throw error;
    }
  }
}
