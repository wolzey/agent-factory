import { expect, it } from 'vitest';
import { RugVisits } from '../client/prototypes/factory25dRugVisits';
import { KEYBOARD_ORIGIN, keyAt } from '../client/prototypes/factory25dKeyboardState';

it('walks onto several real keys and home without teleporting, and yields to pause and user commands', () => {
  const visit = new RugVisits();
  let point = {x:4.55,z:4.18};
  const keys = new Set<number>();
  let began = false;
  for(let i=0;i<750;i++) {
    const next=visit.update(0.1,point,true);
    expect(Math.hypot(next.x-point.x,next.z-point.z)).toBeLessThanOrEqual(0.095001);
    point=next;
    const key=keyAt({x:point.x-KEYBOARD_ORIGIN.x,z:point.z-KEYBOARD_ORIGIN.z});
    if(key>=0) keys.add(key);
    if(visit.active) began=true;
    if(began&&!visit.active) break;
  }
  expect(keys.size).toBeGreaterThanOrEqual(4);
  expect(point).toEqual({x:4.55,z:4.18});
  expect(visit.update(100,point,false)).toEqual(point);
  visit.cancel();
  expect(visit.active).toBe(false);
  expect(visit.update(0.1,point,true)).toEqual(point);
});
