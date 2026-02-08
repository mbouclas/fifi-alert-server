import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Simulation Logger
 *
 * Handles logging for simulation scenarios.
 * Each simulation session gets a timestamped directory, and each scenario
 * logs to a separate file within that directory.
 */
@Injectable()
export class SimulationLogger {
  private readonly logger = new Logger(SimulationLogger.name);
  private sessionDir: string = '';
  private sessionStartTime: Date;

  /**
   * Start a new simulation session
   * Creates a timestamped directory under /logs/simulations/
   */
  async startSession(): Promise<string> {
    this.sessionStartTime = new Date();
    const timestamp = this.sessionStartTime.toISOString().replace(/[:.]/g, '-');
    const baseDir = path.join(process.cwd(), 'logs', 'simulations');
    this.sessionDir = path.join(baseDir, timestamp);

    // Create directory if it doesn't exist
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }

    this.logger.log(`Created simulation session directory: ${this.sessionDir}`);

    // Write session metadata
    await this.writeSessionMetadata('started');

    return timestamp;
  }

  /**
   * End the simulation session
   */
  async endSession(summary: string): Promise<void> {
    await this.writeSessionMetadata('completed', summary);
  }

  /**
   * Write session metadata file
   */
  private async writeSessionMetadata(
    status: string,
    summary?: string,
  ): Promise<void> {
    const metadata = {
      status,
      startTime: this.sessionStartTime.toISOString(),
      endTime: new Date().toISOString(),
      duration: `${(Date.now() - this.sessionStartTime.getTime()) / 1000}s`,
      summary: summary || '',
    };

    const metadataPath = path.join(this.sessionDir, '_session-metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Log a scenario execution
   *
   * @param scenarioName - Name of the scenario (e.g., "01-register-user")
   * @param data - Data to log
   */
  async logScenario(scenarioName: string, data: any): Promise<void> {
    if (!this.sessionDir) {
      throw new Error(
        'Simulation session not started. Call startSession() first.',
      );
    }

    const logFile = path.join(this.sessionDir, `${scenarioName}.json`);

    const logEntry = {
      scenario: scenarioName,
      timestamp: new Date().toISOString(),
      ...data,
    };

    fs.writeFileSync(logFile, JSON.stringify(logEntry, null, 2));
    this.logger.log(`Logged scenario: ${scenarioName}`);
  }

  /**
   * Log an error for a scenario
   */
  async logError(scenarioName: string, error: any): Promise<void> {
    if (!this.sessionDir) {
      throw new Error(
        'Simulation session not started. Call startSession() first.',
      );
    }

    const logFile = path.join(this.sessionDir, `${scenarioName}-error.json`);

    const logEntry = {
      scenario: scenarioName,
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack,
        ...error,
      },
    };

    fs.writeFileSync(logFile, JSON.stringify(logEntry, null, 2));
    this.logger.error(`Logged error for scenario: ${scenarioName}`);
  }

  /**
   * Get the current session directory
   */
  getSessionDir(): string {
    return this.sessionDir;
  }
}
