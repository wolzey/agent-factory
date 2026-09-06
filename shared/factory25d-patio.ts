/** Scene metres. The entry terrace meets the factory; the garden deck sits below it. */
export const PATIO = {
  left: 8.02, right: 24.2, back: -4.65, front: 13.95,
  upperY: 0, lowerY: -1.12, edgeZ: 0.25,
  stairs: { left: 17.35, right: 19.85, top: 0.25, bottom: 2.65, steps: 7 },
  wallClearance: .30,
} as const;

/** One source for geometry, weather, sprite feet, dragging and memorials. */
export function patioFloorHeight({ x, z }: { x: number; z: number }): number {
  if (z <= PATIO.edgeZ) return PATIO.upperY;
  const stairs = PATIO.stairs;
  if (x >= stairs.left && x <= stairs.right && z < stairs.bottom) {
    const step = Math.min(stairs.steps, Math.floor((z - stairs.top) / (stairs.bottom - stairs.top) * stairs.steps) + 1);
    return PATIO.lowerY * step / stairs.steps;
  }
  return PATIO.lowerY;
}

// Physical footprints, before the shared avatar-clearance margin is applied.
// The long retaining edge and stair cheeks make both keyboard movement and
// automatic routes use the steps instead of passing through a change in level.
export const PATIO_OBSTACLES = [
  { left: 11.48, right: 15.82, near: 3.06, far: 4.12 },
  { left: 9.25, right: 13.95, near: 11.55, far: 12.25 },
  { left: 16.2, right: 20.0, near: 11.55, far: 12.25 },
  { left: 8.01, right: 17.35, near: -0.1, far: 0.55, clearance: PATIO.wallClearance },
  { left: 19.85, right: 24.2, near: -0.1, far: 0.55, clearance: PATIO.wallClearance },
  { left: 17.08, right: 17.35, near: 0.25, far: 2.65, clearance: PATIO.wallClearance },
  { left: 19.85, right: 20.12, near: 0.25, far: 2.65, clearance: PATIO.wallClearance },
  { left: 8.22, right: 9.48, near: -3.98, far: -2.72 },
  { left: 22.5, right: 23.8, near: -3.98, far: -2.72 },
  { left: 8.2, right: 9.45, near: 1.85, far: 3.1 },
  { left: 22.5, right: 23.8, near: 1.85, far: 3.1 },
  { left: 23.15, right: 24.0, near: 4.4, far: 10.6 },
  { left: 8.45, right: 13.9, near: 6.4, far: 7.3 },
  { left: 8.45, right: 9.35, near: 6.4, far: 9.1 },
  { left: 10.8, right: 12.2, near: 7.8, far: 8.85 },
  { left: 20.8, right: 22.15, near: 8.25, far: 9.6 },
  { left: 17.5, right: 22.05, near: -3.95, far: -3.15 },
  { left: 9.6, right: 9.8, near: -3.98, far: -3.78 },
  { left: 16.9, right: 17.1, near: -3.98, far: -3.78 },
  { left: 9.6, right: 9.8, near: -0.64, far: -0.44 },
  { left: 16.9, right: 17.1, near: -0.64, far: -0.44 },
];
