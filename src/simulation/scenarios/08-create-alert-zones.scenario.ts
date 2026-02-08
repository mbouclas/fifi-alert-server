import { Injectable, Logger } from '@nestjs/common';
import { ApiClient } from '../utils/api-client.js';
import { SimulationLogger } from '../utils/simulation-logger.js';
import {
  IScenario,
  SimulationState,
} from '../interfaces/scenario.interface.js';

/**
 * Scenario 8: Create Alert Zones
 *
 * This scenario:
 * 1. Creates the first alert zone (Home) via POST /users/me/alert-zones
 * 2. Creates the second alert zone (Work) via POST /users/me/alert-zones
 * 3. Uses the access token from login
 * 4. Logs the response including both zone IDs
 */
@Injectable()
export class CreateAlertZonesScenario implements IScenario {
  private readonly logger = new Logger(CreateAlertZonesScenario.name);

  constructor(
    private readonly apiClient: ApiClient,
    private readonly simulationLogger: SimulationLogger,
  ) {}

  async execute(state: SimulationState): Promise<Partial<SimulationState>> {
    this.logger.log('Executing: Create Alert Zones');

    try {
      // Create first alert zone - Home
      const homeZonePayload = {
        name: 'Home',
        latitude: 37.7749,
        longitude: -122.4194,
        radius_meters: 1000,
        priority: 1,
        is_active: true,
      };

      this.logger.log('Creating first alert zone (Home)...');
      const homeZoneResponse = await this.apiClient.post(
        '/users/me/alert-zones',
        homeZonePayload,
        { token: state.accessToken },
      );

      this.logger.log(`Home zone created with ID: ${homeZoneResponse.data.id}`);

      // Create second alert zone - Work
      const workZonePayload = {
        name: 'Work',
        latitude: 37.7932,
        longitude: -122.3987,
        radius_meters: 500,
        priority: 2,
        is_active: true,
      };

      this.logger.log('Creating second alert zone (Work)...');
      const workZoneResponse = await this.apiClient.post(
        '/users/me/alert-zones',
        workZonePayload,
        { token: state.accessToken },
      );

      this.logger.log(`Work zone created with ID: ${workZoneResponse.data.id}`);

      // Log the scenario result
      await this.simulationLogger.logScenario('08-create-alert-zones', {
        request: {
          homeZone: homeZonePayload,
          workZone: workZonePayload,
        },
        response: {
          homeZone: homeZoneResponse.data,
          workZone: workZoneResponse.data,
        },
        status: {
          homeZone: homeZoneResponse.status,
          workZone: workZoneResponse.status,
        },
      });

      return {
        homeZoneId: Number(homeZoneResponse.data.id),
        workZoneId: Number(workZoneResponse.data.id),
      };
    } catch (error) {
      this.logger.error('Create Alert Zones scenario failed', error);
      await this.simulationLogger.logError('08-create-alert-zones', error);
      throw error;
    }
  }
}
