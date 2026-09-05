import { describe, expect, it } from 'vitest';
import { normalizeBundledClientEnvironment } from '../server/client-environment';
import type { EnvironmentType } from '../shared/types';

describe('bundled client environment compatibility', () => {
  it('upgrades to the 2.5D coordinates despite an older deployment environment override', () => {
    for (const environment of ['arcade', 'farm', 'office', 'mining', 'factory25d', undefined] as const) {
      expect(normalizeBundledClientEnvironment({ title: 'Factory', environment }, 'factory25d').environment).toBe('factory25d');
    }
  });

  it('rolls back a newer environment override to the classic bundle default', () => {
    expect(normalizeBundledClientEnvironment({ title: 'Factory', environment: 'factory25d' }, 'arcade').environment).toBe('arcade');
    expect(normalizeBundledClientEnvironment({ title: 'Factory', environment: 'factory25d' }, 'office').environment).toBe('office');
  });

  it('continues honoring valid classic selections and falls back for missing or unsupported values', () => {
    for (const environment of ['arcade', 'farm', 'office', 'mining'] as const) {
      expect(normalizeBundledClientEnvironment({ title: 'Factory', environment }, 'arcade').environment).toBe(environment);
    }
    expect(normalizeBundledClientEnvironment({ title: 'Factory' }, 'arcade').environment).toBe('arcade');
    expect(normalizeBundledClientEnvironment({ title: 'Factory', environment: 'unknown' as EnvironmentType }, 'arcade').environment).toBe('arcade');
  });

  it('preserves unrelated file/env configuration without mutating the input', () => {
    const original = { title: 'Team room', graphicDeath: false, environment: 'arcade' as const, extra: { roomLabel: 'Studio' } };
    const result = normalizeBundledClientEnvironment(original, 'factory25d');
    expect(result).toEqual({ ...original, environment: 'factory25d' });
    expect(original.environment).toBe('arcade'); expect(result).not.toBe(original);
  });
});
