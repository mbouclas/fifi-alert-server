import { Injectable, Logger } from '@nestjs/common';
import { ApiClient } from '../utils/api-client.js';
import { SimulationLogger } from '../utils/simulation-logger.js';
import {
  IScenario,
  SimulationState,
} from '../interfaces/scenario.interface.js';

/**
 * Scenario 4: List All Alerts
 *
 * This scenario:
 * 1. Retrieves all alerts via GET /alerts
 * 2. Verifies the alert created in scenario 3 is in the list
 * 3. Logs the response
 */
@Injectable()
export class ListAlertsScenario implements IScenario {
  private readonly logger = new Logger(ListAlertsScenario.name);

  constructor(
    private readonly apiClient: ApiClient,
    private readonly simulationLogger: SimulationLogger,
  ) {}

  async execute(state: SimulationState): Promise<Partial<SimulationState>> {
    this.logger.log('Executing: List Alerts');

    try {
      // Query alerts near the location from scenario 3
      const queryParams = {
        lat: 37.7749,
        lon: -122.4194,
        radiusKm: 10,
      };

      const response = await this.apiClient.get('/alerts', {
        query: queryParams,
        token: state.accessToken,
      });

      // Verify the alert from scenario 3 is in the list
      const alerts = response.data;
      const foundAlert = alerts.find(
        (alert: any) => alert.id === state.alertId,
      );

      // Log the scenario result
      await this.simulationLogger.logScenario('04-list-alerts', {
        request: { queryParams },
        response: response.data,
        status: response.status,
        alertCount: alerts.length,
        foundCreatedAlert: !!foundAlert,
        createdAlertId: state.alertId,
      });

      if (!foundAlert) {
        this.logger.warn(`Alert ${state.alertId} not found in list`);
      }

      return {};
    } catch (error) {
      this.logger.error('List Alerts scenario failed', error);
      await this.simulationLogger.logError('04-list-alerts', error);
      throw error;
    }
  }
}
