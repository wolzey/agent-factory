import { describe, expect, it } from 'vitest';
import { FLOOR_KEYS, KEYBOARD_WIDTH, KEYBOARD_DEPTH, keyAt, keyIntensity, stepToward } from '../client/prototypes/factory25dKeyboardState';

describe('floor keyboard footfalls', () => {
  it('hits all 32 key centers including the wide space bar within the keyboard', () => {
    expect(FLOOR_KEYS).toHaveLength(32);
    FLOOR_KEYS.forEach((key, index) => {
      expect(keyAt(key)).toBe(index);
      expect(Math.abs(key.x) + key.width / 2).toBeLessThanOrEqual(KEYBOARD_WIDTH / 2);
      expect(Math.abs(key.z) + key.depth / 2).toBeLessThanOrEqual(KEYBOARD_DEPTH / 2);
    });
    const space = FLOOR_KEYS[30];
    expect(keyAt({x:space.x + space.width * 0.45,z:space.z})).toBe(30);
  });
  it('leaves gaps and the surrounding floor unlit', () => {
    const a = FLOOR_KEYS[0]; const b = FLOOR_KEYS[1];
    expect(keyAt({x:(a.x+a.width/2+b.x-b.width/2)/2,z:a.z})).toBe(-1);
    expect(keyAt({x:10,z:10})).toBe(-1);
  });
  it('keeps a held key lit and fades released keys over 420ms without negative light', () => {
    expect(keyIntensity(0,true,1)).toBe(1);
    expect(keyIntensity(1,false,0.21)).toBeCloseTo(0.5);
    expect(keyIntensity(0.5,false,1)).toBe(0);
    expect(keyIntensity(0.5,false,-1)).toBe(0.5);
  });
  it('walks to a key without overshooting, including zero-length and diagonal moves', () => {
    const diagonal = stepToward({x:0,z:0},{x:3,z:4},2);
    expect(diagonal.x).toBeCloseTo(1.2); expect(diagonal.z).toBeCloseTo(1.6);
    expect(stepToward({x:0,z:0},{x:0.1,z:0},1)).toEqual({x:0.1,z:0});
    expect(stepToward({x:1,z:1},{x:1,z:1},0)).toEqual({x:1,z:1});
  });
});
