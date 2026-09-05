import { clamp01 } from '../sky/skyPhase';
import { lerpWeather } from '../sky/weather';
import type { WeatherVisualState } from '../sky/weather';

/** The visible sun and both renderers use one weather-dependent light level. */
export function weatherLighting(weather: WeatherVisualState) {
  return {
    direct: clamp01(1 - weather.cloud01 * 1.15 - weather.fog01 * 0.5 - weather.rain01 * 0.2 - weather.snow01 * 0.15),
    window: clamp01(1 - weather.cloud01 * 0.23 - weather.rain01 * 0.22 + weather.snow01 * 0.1),
    ambient: clamp01(1 - weather.cloud01 * 0.1 - weather.rain01 * 0.13),
  };
}

/** Interrupted weather changes start from what is currently visible. */
export class WeatherTransition {
  private from: WeatherVisualState;
  private target: WeatherVisualState;
  private startedAt = -Infinity;

  constructor(initial: WeatherVisualState, private readonly durationMs = 1800) {
    this.from = { ...initial };
    this.target = { ...initial };
  }

  at(now: number): WeatherVisualState {
    const t = clamp01((now - this.startedAt) / this.durationMs);
    return lerpWeather(this.from, this.target, t * t * (3 - 2 * t));
  }

  select(target: WeatherVisualState, now: number): void {
    this.from = this.at(now);
    this.target = { ...target };
    this.startedAt = now;
  }

  isChanging(now: number): boolean {
    return now - this.startedAt < this.durationMs;
  }
}
