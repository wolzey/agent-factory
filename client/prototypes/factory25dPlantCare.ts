import { stepToward, type FloorPoint } from './factory25dKeyboardState';

const home = { x: 4.55, z: 4.18 };
const aisle = [
  { x: 6.5, z: 4.45 },
  { x: 6.5, z: 2.85 },
  { x: 7.45, z: 2.85 },
  { x: 7.45, z: -4.97 },
];
const handleOffset = { x: 0.32, z: 0.28 };
const distance = (a: FloorPoint, b: FloorPoint) => Math.hypot(a.x - b.x, a.z - b.z);

/** An occasional idle chore uses the outer doorway and clear window aisle.
 * User navigation interrupts it; the pot always stays where it was placed. */
export class PlantCare {
  private idle = 0;
  private wait = 24;
  private route: FloorPoint[] = [];
  private stage: 'idle' | 'approach' | 'move' | 'return' = 'idle';
  private destination: FloorPoint = home;
  get handling() {
    return this.stage === 'move';
  }
  get active() {
    return this.stage !== 'idle';
  }

  cancel(position: FloorPoint): FloorPoint[] {
    this.stage = 'idle';
    this.route = [];
    this.idle = 0;
    this.wait = 65;
    return position.z < 3.59
      ? [
          { x: 7.45, z: Math.min(position.z, 2.85) },
          { x: 7.45, z: 2.85 },
          { x: 6.5, z: 2.85 },
          { x: 6.5, z: 4.45 },
        ]
      : [];
  }

  update(dt: number, agent: FloorPoint, plant: FloorPoint, enabled: boolean) {
    const result = { agent: { x: agent.x, z: agent.z }, plant: { x: plant.x, z: plant.z } };
    if (!enabled) return result;
    dt = Math.max(0, Math.min(dt, 0.1));
    if (this.stage === 'idle') {
      this.idle += dt;
      if (this.idle < this.wait) return result;
      this.destination = { x: plant.x > 5.6 ? 5.15 : 5.85, z: plant.z };
      this.route = [...aisle, { x: plant.x + handleOffset.x, z: plant.z + handleOffset.z }];
      this.stage = 'approach';
      this.idle = 0;
    }
    if (this.stage === 'move') {
      result.plant = stepToward(plant, this.destination, dt * 0.23);
      result.agent = { x: result.plant.x + handleOffset.x, z: result.plant.z + handleOffset.z };
      if (distance(result.plant, this.destination) < 0.001) {
        this.route = [...aisle].reverse().concat(home);
        this.stage = 'return';
      }
      return result;
    }
    const target = this.route[0];
    if (!target) return result;
    result.agent = stepToward(agent, target, dt * 1.15);
    if (distance(result.agent, target) < 0.001) {
      this.route.shift();
      if (!this.route.length) {
        if (this.stage === 'approach') this.stage = 'move';
        else {
          this.stage = 'idle';
          this.wait = 48;
        }
      }
    }
    return result;
  }
}
