import { describe, it, expect } from 'vitest';
import { PlantCare } from '../client/prototypes/factory25dPlantCare';

describe('occasional plant care', () => {
  it('walks through the side doorway, moves a pot without teleporting, then returns', () => {
    const care = new PlantCare();
    let agent = { x: 4.55, z: 4.18 };
    let plant = { x: 5.85, z: -5.25 };
    let handled = false;
    let crossedDoor = false;
    for (let i = 0; i < 750; i++) {
      const next = care.update(0.1, agent, plant, true);
      expect(Math.hypot(next.agent.x - agent.x, next.agent.z - agent.z)).toBeLessThanOrEqual(0.116);
      expect(Math.hypot(next.plant.x - plant.x, next.plant.z - plant.z)).toBeLessThanOrEqual(0.024);
      if (Math.min(agent.z, next.agent.z) < 3.59 && Math.max(agent.z, next.agent.z) >= 3.59) {
        expect(next.agent.x).toBeGreaterThan(5.8);
        expect(next.agent.x).toBeLessThan(7.2);
        crossedDoor = true;
      }
      handled ||= care.handling;
      agent = next.agent;
      plant = next.plant;
    }
    expect(handled && crossedDoor).toBe(true);
    expect(plant.x).toBeCloseTo(5.15);
    expect(agent).toEqual({ x: 4.55, z: 4.18 });
  });
  it('pauses while inactive and cancels without moving the plant', () => {
    const care = new PlantCare();
    let agent = { x: 4.55, z: 4.18 };
    let plant = { x: 5.85, z: -5.25 };
    for (let i = 0; i < 600 && !care.handling; i++) ({ agent, plant } = care.update(0.1, agent, plant, true));
    expect(care.handling).toBe(true);
    expect(care.update(1, agent, plant, false)).toEqual({ agent, plant });
    const route = care.cancel(agent);
    expect(route.at(-1)?.z).toBe(4.45);
    expect(care.active).toBe(false);
    expect(care.update(0.1, agent, plant, true)).toEqual({ agent, plant });
  });
});
