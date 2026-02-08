import { Injectable, Logger } from '@nestjs/common';
import { ApiClient } from '../utils/api-client.js';
import { SimulationLogger } from '../utils/simulation-logger.js';
import {
  IScenario,
  SimulationState,
} from '../interfaces/scenario.interface.js';

/**
 * Scenario 9: List Alert Zones
 *
 * This scenario:
 * 1. Retrieves all alert zones for the authenticated user via GET /users/me/alert-zones
 * 2. Verifies the two zones created in scenario 8 are in the list
 * 3. Logs the response with zone details
 */
@Injectable()
export class ListAlertZonesScenario implements IScenario {
  private readonly logger = new Logger(ListAlertZonesScenario.name);

  constructor(
    private readonly apiClient: ApiClient,
    private readonly simulationLogger: SimulationLogger,
  ) {}

  async execute(state: SimulationState): Promise<Partial<SimulationState>> {
    this.logger.log('Executing: List Alert Zones');

    try {
      const response = await this.apiClient.get('/users/me/alert-zones', {
        token: state.accessToken,
      });

      // Verify the zones from scenario 8 are in the list
      const zones = response.data;
      const foundHomeZone = zones.find(
        (zone: any) => zone.id === state.homeZoneId,
      );
      const foundWorkZone = zones.find(
        (zone: any) => zone.id === state.workZoneId,
      );

      // Log the scenario result
      await this.simulationLogger.logScenario('09-list-alert-zones', {
        request: {},
        response: response.data,
        status: response.status,
        zoneCount: zones.length,
        foundHomeZone: !!foundHomeZone,
        foundWorkZone: !!foundWorkZone,
        homeZoneId: state.homeZoneId,
        workZoneId: state.workZoneId,
      });

      if (!foundHomeZone) {
        this.logger.warn(
          `Home zone (ID: ${state.homeZoneId}) not found in list`,
        );
      }

      if (!foundWorkZone) {
        this.logger.warn(
          `Work zone (ID: ${state.workZoneId}) not found in list`,
        );
      }

      if (foundHomeZone && foundWorkZone) {
        this.logger.log('✅ Both alert zones successfully found in the list');
      }

      return {};
    } catch (error) {
      this.logger.error('List Alert Zones scenario failed', error);
      await this.simulationLogger.logError('09-list-alert-zones', error);
      throw error;
    }
  }
}
