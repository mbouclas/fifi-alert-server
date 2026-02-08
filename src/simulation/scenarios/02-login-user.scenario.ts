import { Injectable, Logger } from '@nestjs/common';
import { ApiClient } from '../utils/api-client.js';
import { SimulationLogger } from '../utils/simulation-logger.js';
import {
  IScenario,
  SimulationState,
} from '../interfaces/scenario.interface.js';

/**
 * Scenario 2: Login User
 *
 * This scenario:
 * 1. Logs in the user with credentials from registration
 * 2. Stores the access token and refresh token for subsequent requests
 * 3. Logs the response
 */
@Injectable()
export class LoginUserScenario implements IScenario {
  private readonly logger = new Logger(LoginUserScenario.name);

  constructor(
    private readonly apiClient: ApiClient,
    private readonly simulationLogger: SimulationLogger,
  ) {}

  async execute(state: SimulationState): Promise<Partial<SimulationState>> {
    this.logger.log('Executing: Login User');

    try {
      const loginPayload = {
        email: state.email,
        password: state.password,
      };

      const response = await this.apiClient.post('/auth/login', loginPayload);

      // Log the scenario result
      await this.simulationLogger.logScenario('02-login-user', {
        request: loginPayload,
        response: response.data,
        status: response.status,
      });

      return {
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
        userId: Number(response.data.user.id),
      };
    } catch (error) {
      this.logger.error('Login User scenario failed', error);
      await this.simulationLogger.logError('02-login-user', error);
      throw error;
    }
  }
}
