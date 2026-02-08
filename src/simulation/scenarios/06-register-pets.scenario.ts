import { Injectable, Logger } from '@nestjs/common';
import { ApiClient } from '../utils/api-client.js';
import { SimulationLogger } from '../utils/simulation-logger.js';
import {
  IScenario,
  SimulationState,
} from '../interfaces/scenario.interface.js';

/**
 * Scenario 6: Register Two Pets
 *
 * This scenario:
 * 1. Registers the first pet (a dog) via POST /pets
 * 2. Registers the second pet (a cat) via POST /pets
 * 3. Uses the access token from login
 * 4. Logs the response including both pet IDs and tag IDs
 */
@Injectable()
export class RegisterPetsScenario implements IScenario {
  private readonly logger = new Logger(RegisterPetsScenario.name);

  constructor(
    private readonly apiClient: ApiClient,
    private readonly simulationLogger: SimulationLogger,
  ) {}

  async execute(state: SimulationState): Promise<Partial<SimulationState>> {
    this.logger.log('Executing: Register Two Pets');

    try {
      // Register first pet - a dog
      const firstPetPayload = {
        type: 'DOG',
        name: 'Max',
        gender: 'MALE',
        size: 'LARGE',
        photos: ['https://example.com/max.jpg'],
        birthday: '2020-05-15T00:00:00.000Z',
        isMissing: false,
      };

      this.logger.log('Registering first pet (dog)...');
      const firstPetResponse = await this.apiClient.post(
        '/pets',
        firstPetPayload,
        { token: state.accessToken },
      );

      this.logger.log(
        `First pet registered with ID: ${firstPetResponse.data.id}, Tag: ${firstPetResponse.data.tagId}`,
      );

      // Register second pet - a cat
      const secondPetPayload = {
        type: 'CAT',
        name: 'Luna',
        gender: 'FEMALE',
        size: 'SMALL',
        photos: ['https://example.com/luna.jpg'],
        birthday: '2021-08-20T00:00:00.000Z',
        isMissing: false,
      };

      this.logger.log('Registering second pet (cat)...');
      const secondPetResponse = await this.apiClient.post(
        '/pets',
        secondPetPayload,
        { token: state.accessToken },
      );

      this.logger.log(
        `Second pet registered with ID: ${secondPetResponse.data.id}, Tag: ${secondPetResponse.data.tagId}`,
      );

      // Log the scenario result
      await this.simulationLogger.logScenario('06-register-pets', {
        request: {
          firstPet: firstPetPayload,
          secondPet: secondPetPayload,
        },
        response: {
          firstPet: firstPetResponse.data,
          secondPet: secondPetResponse.data,
        },
        status: {
          firstPet: firstPetResponse.status,
          secondPet: secondPetResponse.status,
        },
      });

      return {
        firstPetId: Number(firstPetResponse.data.id),
        secondPetId: Number(secondPetResponse.data.id),
        firstPetTagId: firstPetResponse.data.tagId,
        secondPetTagId: secondPetResponse.data.tagId,
      };
    } catch (error) {
      this.logger.error('Register Pets scenario failed', error);
      await this.simulationLogger.logError('06-register-pets', error);
      throw error;
    }
  }
}
