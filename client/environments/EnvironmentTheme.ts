import type { EnvironmentType } from '@shared/types';

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
  generate: (textures: Phaser.Textures.TextureManager) => void;
}

export interface SignConfig {
  x: number;
  y: number;
  text: string;
  color: string;
  baseAlpha: number;
  flickerMs: number;
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

  floors: {
    main: FloorConfig;
    counter: FloorConfig;
    lounge: FloorConfig;
    entrance: FloorConfig;
  };

  wall: WallConfig;
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
