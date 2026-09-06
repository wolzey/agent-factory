import type { EmoteType } from '@shared/types';

// Shared with the original room's EmoteWheel so both rooms keep the same loadout.
export const EMOTE_GLYPHS: Record<EmoteType, string> = {
  dance: '♪', jump: '↑', guitar: '♫', gun: '✦', laugh: 'HA', wave: 'o/',
  sleep: 'Zz', explode: 'BOOM', dizzy: '@', flex: '💪', rage: '!!', fart: '~',
};
