import * as THREE from 'three';
import { PATIO_STATIONS } from './factory25dWorkstations';
import { propPart, standard } from './factory25dProps';
import { contactShadow } from './factory25dContactShadows';
import type { StationFeedback } from './factory25dActivityFeedback';

export function createPatioStations(parent: THREE.Group) {
  const oak = standard('#a58254', 1), teal = standard('#447d76', 1), iron = standard('#303f47', 1);
  const screens = new Map<string, THREE.MeshStandardMaterial>();
  for (const station of PATIO_STATIONS) {
    const desk = new THREE.Group(); desk.position.set(station.x, 0, station.z); parent.add(desk);
    const solar = station.id === 'patio-5';
    // All decks meet the same standing work pose as the indoor cabinets.
    propPart(desk, [1.5, 0.075, 0.65], [0, 0.41, 0], solar ? teal : oak);
    for (const x of [-0.58, 0.58]) {
      propPart(desk, [0.07, 0.38, 0.47], [x, 0.19, 0], iron);
      contactShadow(desk, { x, width: 0.1, depth: 0.47, spread: 0.09, opacity: 0.24 });
    }
    propPart(desk, [0.46, 0.022, 0.28], [0, 0.458, 0.08], iron);
    const lid = propPart(desk, [0.46, 0.28, 0.032], [0, 0.59, -0.065], solar ? teal : iron);
    lid.rotation.x = -0.14;
    const screenMaterial = standard('#27454b', 1, '#10272a'); screens.set(station.id, screenMaterial);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.39, 0.22), screenMaterial);
    screen.position.z = 0.018; lid.add(screen);
    // Tiny enamel mugs and notebooks keep these readable as places to work.
    propPart(desk, [0.1, 0.1, 0.1], [0.48, 0.5, 0.08], standard('#db8f4a', 1));
    propPart(desk, [0.21, 0.024, 0.26], [-0.43, 0.46, 0.04], standard(solar ? '#ddd4a3' : '#748d9b', 1));
    if (solar) {
      const panel = new THREE.Group(); panel.position.set(0, 0.63, -0.42); panel.rotation.x = -0.5; desk.add(panel);
      propPart(panel, [1.2, 0.46, 0.025], [0, 0, 0], standard('#334c69', 0.6));
      for (const x of [-0.38, 0, 0.38]) propPart(panel, [0.012, 0.44, 0.012], [x, 0, 0.019], standard('#87adb8', 1));
      propPart(desk, [0.28, 0.25, 0.3], [0.44, 0.13, -0.05], teal);
      propPart(desk, [0.08, 0.025, 0.01], [0.44, 0.2, 0.107], standard('#edbd61', 1, '#ac7634'));
    }
  }
  // Join the pair of desks into one picnic table, with a bench on the far side.
  propPart(parent, [1.25, 0.075, 0.65], [13.65, 0.41, 3.8], oak);
  propPart(parent, [4.15, 0.07, 0.28], [13.65, 0.24, 3.22], teal);
  for (const x of [11.95, 15.35]) propPart(parent, [0.075, 0.21, 0.25], [x, 0.105, 3.22], iron);
  return {
    setFeedback(states: Map<string, StationFeedback>, reducedMotion = false) {
      for (const [id, material] of screens) {
        const state = states.get(id), on = state?.active ?? false;
        material.color.set(on || state?.error ? state!.color : '#27454b');
        material.emissive.set(on || state?.error ? state!.color : '#10272a');
        material.emissiveIntensity = on ? 0.55 + state!.heat * 0.15 + (reducedMotion ? 0 : state!.pulse * 0.15) : (state?.error ?? 0) * 0.35;
      }
    },
    setOccupied(ids: Set<string>) {
      for (const [id, material] of screens) {
        material.color.set(ids.has(id) ? '#69e5bf' : '#27454b');
        material.emissive.set(ids.has(id) ? '#39b89d' : '#10272a');
      }
    },
  };
}
