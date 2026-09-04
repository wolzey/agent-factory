export type CloudLayerSpec = {
  texture: string;
  depthOffset: number;
  drift: number;
  alpha: number;
  weight: (weights: readonly [number, number, number]) => number;
  horizonMix: number;
};

export const CLOUD_LAYER_PLAN: readonly CloudLayerSpec[] = [
  { texture: 'sky_clouds_distant', depthOffset: 0.02, drift: 0.28, alpha: 0.52, weight: weights => weights[2], horizonMix: 0.62 },
  { texture: 'sky_clouds_cirrus', depthOffset: 0.035, drift: 0.38, alpha: 0.58, weight: weights => weights[0], horizonMix: 0.48 },
  { texture: 'sky_clouds_cumulus', depthOffset: 0.075, drift: 0.48, alpha: 0.58, weight: weights => weights[1], horizonMix: 0.44 },
  { texture: 'sky_clouds_storm', depthOffset: 0.12, drift: 0.62, alpha: 0.46, weight: weights => weights[2], horizonMix: 0.64 },
  { texture: 'sky_clouds_foreground', depthOffset: 0.17, drift: 0.76, alpha: 0.44, weight: weights => Math.max(weights[1] * 0.45, weights[2] * 0.78), horizonMix: 0.44 },
] as const;
