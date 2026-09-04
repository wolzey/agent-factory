import type { EnvironmentType, Position } from '@shared/types';
import type { WorldLayoutSpec } from '@shared/world-layouts';
import type { SkylinePartner } from '../sky/partners';

export type { Position };

export type ActivityBucket = 'working' | 'thinking' | 'waiting' | 'idle' | 'stopped';
export type Zone = 'work' | 'waiting' | 'idle';
export type ActionPose = 'work' | 'sit';
export type ActionLoop =
  | 'default_work'
  | 'default_waiting'
  | 'default_idle'
  | 'mining_work'
  | 'mining_waiting'
  | 'mining_idle';

export interface ActionSpec {
  zone: Zone;
  pose: ActionPose;
  loop: ActionLoop;
}

export type LayoutSpec = WorldLayoutSpec;

export interface BehaviorConfig {
  layout: LayoutSpec;
  actionsByBucket: Record<ActivityBucket, ActionSpec>;
}

export interface FloorConfig {
  key: string;
  generate: (textures: Phaser.Textures.TextureManager) => void;
}

export interface PropConfig {
  textureKey: string;
  x: number;
  y: number;
  scale: number;
  depth: number;
  angle?: number;
  generate: (textures: Phaser.Textures.TextureManager) => void;
}

export interface SignConfig {
  x: number;
  y: number;
  text: string;
  color: string;
  baseAlpha: number;
  flickerMs: number;
  fontSize?: string;
}

export interface WorkstationConfig {
  textureKey: string;
  frameCount: number;
  idleAnim: string;
  activeAnim: string;
  generate: (textures: Phaser.Textures.TextureManager, anims: Phaser.Animations.AnimationManager) => void;
  glowColor: number;
  activeGlowColor: number;
  floorGlowColor: number;
}

export interface WallConfig {
  baseColor: number;
  stripeColor: number;
  stripeAlpha: number;
  edgeColor: number;
  highlightColor: number;
  highlightAlpha: number;
  neonStripColor: number;
  neonStripAlpha: number;
  neonGlowAlpha: number;
}

/** Optional pixel-art skyline window set into the top wall band. */
export interface SkylineWindowConfig {
  frameColor: number;
  mullionColor: number;
  sillColor: number;
  panes: number;
  showCity?: boolean;
  /** Organisations from the approved public source to place on the skyline; omit for a fully generic city. */
  partners?: readonly SkylinePartner[];
}

export interface BottomStripConfig {
  counterSurfaceColor: number;
  counterDarkColor: number;
  counterAccentColor: number;
  showBell: boolean;
  loungeAccentColor: number;
  loungeAccentAlpha: number;
}

export interface ZoneLabels {
  mainLabel: string;
  mainLabelColor: string;
  counterLabel: string;
  counterLabelColor: string;
  loungeLabel: string;
  loungeLabelColor: string;
}

export interface TitleSignConfig {
  bgColor: number;
  bgAlpha: number;
  shadowColor: string;
  textColor: string;
  glowColor: number;
}

export interface ParticleConfig {
  count: number;
  color: number;
  minAlpha: number;
  maxAlpha: number;
  durationRange: [number, number];
  driftRange: [number, number];
}

export interface EnvironmentTheme {
  type: EnvironmentType;
  backgroundColor: string;
  behavior: BehaviorConfig;

  floors: {
    main: FloorConfig;
    counter: FloorConfig;
    lounge: FloorConfig;
    entrance: FloorConfig;
  };

  wall: WallConfig;
  /** When set, the wall band shows the Wasatch skyline window behind the signs. */
  skylineWindow?: SkylineWindowConfig;
  bottomStrip: BottomStripConfig;

  zoneDividerColor: number;
  zoneDividerAlpha: number;

  workstation: WorkstationConfig;

  labels: ZoneLabels;
  titleSign: TitleSignConfig;
  signs: SignConfig[];

  props: PropConfig[];
  particles: ParticleConfig;

  showScanlines: boolean;
  scanlineAlpha: number;
  showVignette: boolean;

  hudAccentColor: string;
}
