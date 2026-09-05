import type { EnvironmentType, ServerConfig } from '../shared/types.js';

const classicEnvironments = new Set<EnvironmentType>(['arcade', 'farm', 'office', 'mining']);

/** Keep the server's coordinates compatible with the client shipped in this build. */
export function normalizeBundledClientEnvironment(config: ServerConfig, bundledDefault: EnvironmentType): ServerConfig {
  const environment = bundledDefault === 'factory25d' ? 'factory25d'
    : config.environment && classicEnvironments.has(config.environment) ? config.environment : bundledDefault;
  return { ...config, environment };
}
