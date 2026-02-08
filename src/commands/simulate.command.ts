import { Command, CommandRunner } from 'nest-commander';
import { Injectable, Logger } from '@nestjs/common';
import { SimulationService } from '../simulation/simulation.service.js';

/**
 * Simulate Command
 *
 * This command simulates various scenarios for testing purposes.
 * It runs against the shadow database and uses API endpoints via fetch.
 *
 * Scenarios executed:
 * 1. Register a new user with User role
 * 2. Login with created credentials
 * 3. Register two pets (a dog and a cat)
 * 4. List all pets for the user
 * 5. Create a new alert
 * 6. List all alerts
 * 7. Logout
 *
 * Logs are written to: /logs/simulations/{timestamp}/
 *
 * Usage:
 *   bun run cli simulate
 */
@Command({
  name: 'simulate',
  description: 'Simulate various scenarios for testing purposes',
})
@Injectable()
export class SimulateCommand extends CommandRunner {
  private readonly logger = new Logger(SimulateCommand.name);

  constructor(private readonly simulationService: SimulationService) {
    super();
  }

  async run(inputs: string[], options?: Record<string, any>): Promise<void> {
    this.logger.log('🎭 Starting simulation...');

    try {
      await this.simulationService.runSimulation();
      this.logger.log('✅ Simulation completed successfully!');
      console.log('\n📂 Check logs in: /logs/simulations/');
    } catch (error) {
      this.logger.error('❌ Simulation failed', error.message);
      throw error;
    }
  }
}
