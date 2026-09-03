import { describe, expect, it } from 'vitest';
import { createRpsRound, rpsDelayForPair, rpsOutcome, rpsPairKey } from '../shared/rps.js';

describe('rock paper scissors', () => {
  it('uses a stable unordered pair key and bounded spontaneous delay', () => {
    expect(rpsPairKey('b', 'a')).toBe('a:b');
    expect(rpsDelayForPair('a', 'b')).toBe(rpsDelayForPair('b', 'a'));
    expect(rpsDelayForPair('a', 'b')).toBeGreaterThanOrEqual(18_000);
    expect(rpsDelayForPair('a', 'b')).toBeLessThan(42_000);
  });

  it('scores every outcome correctly', () => {
    expect(rpsOutcome('rock', 'scissors')).toBe('win');
    expect(rpsOutcome('paper', 'scissors')).toBe('lose');
    expect(rpsOutcome('scissors', 'scissors')).toBe('draw');
  });

  it('creates the same deterministic round for every viewer', () => {
    const first = createRpsRound('a', 'b', 12_345);
    expect(createRpsRound('a', 'b', 12_345)).toEqual(first);
    expect(rpsOutcome(first.firstChoice, first.secondChoice)).toBe(first.firstOutcome);
    expect(rpsOutcome(first.secondChoice, first.firstChoice)).toBe(first.secondOutcome);
  });
});
