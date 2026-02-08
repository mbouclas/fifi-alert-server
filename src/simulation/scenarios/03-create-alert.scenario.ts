import { Injectable, Logger } from '@nestjs/common';
import { ApiClient } from '../utils/api-client.js';
import { SimulationLogger } from '../utils/simulation-logger.js';
import {
  IScenario,
  SimulationState,
} from '../interfaces/scenario.interface.js';

/**
 * Scenario 3: Create a New Alert
 *
 * This scenario:
 * 1. Creates a missing pet alert via POST /alerts
 * 2. Uses the access token from login
 * 3. Logs the response including the alert ID
 */
@Injectable()
export class CreateAlertScenario implements IScenario {
  private readonly logger = new Logger(CreateAlertScenario.name);

  constructor(
    private readonly apiClient: ApiClient,
    private readonly simulationLogger: SimulationLogger,
  ) {}

  async execute(state: SimulationState): Promise<Partial<SimulationState>> {
    this.logger.log('Executing: Create Alert');

    try {
      const createAlertPayload = {
        pet: {
          name: 'Max',
          species: 'DOG',
          breed: 'Golden Retriever',
          description:
            'Friendly golden retriever, very social with a distinctive golden coat',
          color: 'Golden',
          ageYears: 3,
          photos: ['https://example.com/photo1.jpg'],
        },
        location: {
          lat: 37.7749,
          lon: -122.4194,
          address: '123 Market St, San Francisco, CA 94102',
          lastSeenTime: new Date().toISOString(),
          radiusKm: 5.0,
        },
        contact: {
          phone: '+14155550101',
          email: state.email,
          isPhonePublic: true,
        },
        reward: {
          offered: true,
          amount: 500,
        },
        notes:
          'Max ran away during a walk when startled by fireworks. Please call if you see him!',
      };

      const response = await this.apiClient.post(
        '/alerts',
        createAlertPayload,
        { token: state.accessToken },
      );

      // Log the scenario result
      await this.simulationLogger.logScenario('03-create-alert', {
        request: createAlertPayload,
        response: response.data,
        status: response.status,
      });

      return {
        alertId: Number(response.data.id),
      };
    } catch (error) {
      this.logger.error('Create Alert scenario failed', error);
      await this.simulationLogger.logError('03-create-alert', error);
      throw error;
    }
  }
}
