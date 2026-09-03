import type { RpsChoice, RpsOutcome } from './types.js';

export const RPS_CHOICES: readonly RpsChoice[] = ['rock', 'paper', 'scissors'];

function hash(input: string): number {
  let value = 2166136261;
  for (const character of input) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}

export function rpsPairKey(firstSessionId: string, secondSessionId: string): string {
  return [firstSessionId, secondSessionId].sort().join(':');
}

export function rpsOutcome(choice: RpsChoice, opponent: RpsChoice): RpsOutcome {
  if (choice === opponent) return 'draw';
  if (
    (choice === 'rock' && opponent === 'scissors')
    || (choice === 'paper' && opponent === 'rock')
    || (choice === 'scissors' && opponent === 'paper')
  ) return 'win';
  return 'lose';
}

export function createRpsRound(firstSessionId: string, secondSessionId: string, timestamp: number) {
  const pair = rpsPairKey(firstSessionId, secondSessionId);
  const round = Math.floor(timestamp / 1_000);
  const firstChoice = RPS_CHOICES[hash(`${pair}:${round}:first`) % RPS_CHOICES.length];
  const secondChoice = RPS_CHOICES[hash(`${pair}:${round}:second`) % RPS_CHOICES.length];
  return {
    firstChoice,
    secondChoice,
    firstOutcome: rpsOutcome(firstChoice, secondChoice),
    secondOutcome: rpsOutcome(secondChoice, firstChoice),
  } as const;
}

export function rpsDelayForPair(firstSessionId: string, secondSessionId: string): number {
  return 18_000 + hash(rpsPairKey(firstSessionId, secondSessionId)) % 24_000;
}
