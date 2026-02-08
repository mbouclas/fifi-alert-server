import { Injectable, Logger } from '@nestjs/common';
import { ApiClient } from '../utils/api-client.js';
import { SimulationLogger } from '../utils/simulation-logger.js';
import {
  IScenario,
  SimulationState,
} from '../interfaces/scenario.interface.js';

/**
 * Scenario 7: List User's Pets
 *
 * This scenario:
 * 1. Retrieves all pets for the authenticated user via GET /pets
 * 2. Verifies the two pets created in scenario 6 are in the list
 * 3. Logs the response with pet details
 */
@Injectable()
export class ListPetsScenario implements IScenario {
  private readonly logger = new Logger(ListPetsScenario.name);

  constructor(
    private readonly apiClient: ApiClient,
    private readonly simulationLogger: SimulationLogger,
  ) {}

  async execute(state: SimulationState): Promise<Partial<SimulationState>> {
    this.logger.log('Executing: List Pets');

    try {
      const response = await this.apiClient.get('/pets', {
        token: state.accessToken,
      });

      // Verify the pets from scenario 6 are in the list
      const pets = response.data;
      const foundFirstPet = pets.find(
        (pet: any) => pet.id === state.firstPetId,
      );
      const foundSecondPet = pets.find(
        (pet: any) => pet.id === state.secondPetId,
      );

      // Log the scenario result
      await this.simulationLogger.logScenario('07-list-pets', {
        request: {},
        response: response.data,
        status: response.status,
        petCount: pets.length,
        foundFirstPet: !!foundFirstPet,
        foundSecondPet: !!foundSecondPet,
        firstPetId: state.firstPetId,
        secondPetId: state.secondPetId,
      });

      if (!foundFirstPet) {
        this.logger.warn(
          `First pet (ID: ${state.firstPetId}) not found in list`,
        );
      }

      if (!foundSecondPet) {
        this.logger.warn(
          `Second pet (ID: ${state.secondPetId}) not found in list`,
        );
      }

      if (foundFirstPet && foundSecondPet) {
        this.logger.log('✅ Both pets successfully found in the list');
      }

      return {};
    } catch (error) {
      this.logger.error('List Pets scenario failed', error);
      await this.simulationLogger.logError('07-list-pets', error);
      throw error;
    }
  }
}
