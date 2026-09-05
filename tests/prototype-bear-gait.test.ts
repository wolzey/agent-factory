import { expect, it } from 'vitest';
import { BearFootsteps } from '../client/prototypes/factory25dBearGait';

it('keeps stance paws fixed in world space while swinging paws clear sloping ground', () => {
  const ground = (x: number) => 1.7 + x * 0.04;
  const gait = new BearFootsteps(ground);
  const nominal = (x: number) => [-0.05,-0.05,0.04,0.04].map((offset,i)=>({x:x+offset,y:0,z:i%2*0.05}));
  gait.reset(nominal(0));
  const planted = gait.feet.map(p=>({...p}));
  const lifted = gait.update(0.04,nominal(0.03),{x:1,z:0},true);
  expect(lifted[1]).toEqual(planted[1]);
  expect(lifted[2]).toEqual(planted[2]);
  expect(lifted[0].y).toBeGreaterThan(ground(lifted[0].x));
  expect(lifted[3].y).toBeGreaterThan(ground(lifted[3].x));
  gait.update(0.1,nominal(0.052),{x:1,z:0},true);
  for (const paw of gait.feet) expect(paw.y).toBeCloseTo(ground(paw.x));
});
