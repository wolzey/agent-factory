import { describe, expect, it } from 'vitest';
import {
  hexToColor,
  multiplyColors,
  resolveGrabAnchor,
  resolveSheetGrabAnchor,
  shadeColor,
} from '../client/grab/anchors';

describe('grab anchors', () => {
  it('lifts short-haired avatars by the collar in their shirt colour', () => {
    const anchor = resolveGrabAnchor({
      spriteIndex: 3, color: '#000000', hat: null, trail: null,
      hairStyle: 0, hairColor: '#664422', shirtColor: '#ff922b',
    });
    expect(anchor).toEqual({ kind: 'collar', offsetX: 0, offsetY: -1, color: 0xff922b });
  });

  it('lifts long-haired avatars by the hair in their hair colour', () => {
    const anchor = resolveGrabAnchor({
      spriteIndex: 0, color: '#4a90d9', hat: null, trail: null,
      hairStyle: 2, hairColor: '#e8d5b5', shirtColor: '#ff922b',
    });
    expect(anchor).toEqual({ kind: 'hair', offsetX: 0, offsetY: -12, color: 0xe8d5b5 });
  });

  it('falls back to the legacy colour and sprite-index hair style when granular fields are missing', () => {
    expect(resolveGrabAnchor({ spriteIndex: 0, color: '#4a90d9', hat: null, trail: null }))
      .toMatchObject({ kind: 'collar', color: 0x4a90d9 });
    // spriteIndex 2 resolves to hair style 2 (Long Sides) with palette colour #222222
    expect(resolveGrabAnchor({ spriteIndex: 2, color: '#4a90d9', hat: null, trail: null }))
      .toMatchObject({ kind: 'hair', color: 0x222222 });
    expect(resolveGrabAnchor(undefined)).toMatchObject({ kind: 'collar', color: 0x4a90d9 });
  });

  it('matches the visible colour of tinted legacy sheets used by subagents', () => {
    // agent_0 sheet has a #4a90d9 shirt; a mint tint multiplies it channel by channel
    const mint = 0x88ffaa;
    const anchor = resolveSheetGrabAnchor(0, mint);
    expect(anchor.kind).toBe('collar');
    expect(anchor.color).toBe(multiplyColors(0x4a90d9, mint));

    // sheet 2 has long sides; index wraps modulo 8
    expect(resolveSheetGrabAnchor(10, null)).toEqual({ kind: 'hair', offsetX: 0, offsetY: -12, color: 0x222222 });
  });

  it('applies an extra tint (zombie green) on top of custom avatar colours', () => {
    const anchor = resolveGrabAnchor(
      { spriteIndex: 0, color: '#ffffff', hat: null, trail: null, hairStyle: 1, shirtColor: '#ffffff' },
      0x448833,
    );
    expect(anchor.color).toBe(0x448833);
  });

  it('has colour helpers that stay inside 0..255 per channel', () => {
    expect(hexToColor('#ff00aa', 0)).toBe(0xff00aa);
    expect(hexToColor('nonsense', 0x123456)).toBe(0x123456);
    expect(hexToColor(undefined, 0x123456)).toBe(0x123456);
    expect(multiplyColors(0xffffff, 0x336699)).toBe(0x336699);
    expect(multiplyColors(0x808080, 0x808080)).toBe(0x404040);
    expect(shadeColor(0x808080, 2)).toBe(0xffffff);
    expect(shadeColor(0x808080, 0.5)).toBe(0x404040);
  });
});
