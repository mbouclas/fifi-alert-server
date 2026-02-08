/**
 * Simulation State
 *
 * Shared state passed between scenarios during simulation execution.
 */
export interface SimulationState {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  accessToken: string;
  refreshToken: string;
  userId: number;
  alertId: number;
  [key: string]: any; // Allow additional properties
}

/**
 * Base Scenario Interface
 *
 * All scenario classes must implement this interface.
 */
export interface IScenario {
  /**
   * Execute the scenario
   * @param state - Current simulation state
   * @returns Updated state properties (will be merged into main state)
   */
  execute(state: SimulationState): Promise<Partial<SimulationState>>;
}
