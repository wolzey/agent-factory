import type { EnvironmentType } from '@shared/types';
import type { EnvironmentTheme } from './EnvironmentTheme';
import { ARCADE_THEME } from './ArcadeTheme';
import { FARM_THEME } from './FarmTheme';
import { MINING_THEME } from './MiningTheme';
import { OFFICE_THEME } from './OfficeTheme';

const THEMES: Record<EnvironmentType, EnvironmentTheme> = {
  arcade: ARCADE_THEME,
  farm: FARM_THEME,
  mining: MINING_THEME,
  office: OFFICE_THEME,
};

export function getTheme(type: EnvironmentType): EnvironmentTheme {
  return THEMES[type] ?? THEMES.arcade;
}

export type { EnvironmentTheme };
export type {
  ActionSpec,
  ActivityBucket,
  BehaviorConfig,
  LayoutSpec,
  Position,
  WorkstationConfig,
  Zone,
} from './EnvironmentTheme';
