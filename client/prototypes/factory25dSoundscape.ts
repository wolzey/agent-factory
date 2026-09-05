import { clamp01 } from '../sky/skyPhase';
import type { WeatherVisualState } from '../sky/weather';

export interface SoundEnvironment {
  weather: WeatherVisualState;
  patio01: number;
  window01: number;
  night: boolean;
  reading: boolean;
}

/** The same weather and camera position drive both the view and the acoustic space. */
export function soundscapeMix({ weather, patio01, window01, night, reading }: SoundEnvironment) {
  const outside = clamp01(patio01);
  const glass = clamp01(window01) * (1 - outside);
  const rain = Math.pow(clamp01(weather.rain01), 0.7);
  const snow = clamp01(weather.snow01);
  const focus = reading ? 0.72 : 1;
  const fair = ['clear', 'post-rain'].includes(weather.mode)
    && weather.rain01 < 0.015 && weather.snow01 < 0.015;
  return {
    rain: rain * (0.2 + outside * 0.34 + glass * 0.06) * focus,
    rainCutoff: 1200 + outside * 5600 + glass * 650,
    windowRain: rain * (0.1 + glass * 0.13) * (1 - outside) * focus,
    wind: (0.1 + clamp01(weather.wind01) * 0.3)
      * (0.15 + outside * 0.85 + glass * 0.2) * (1 - snow * 0.4) * focus,
    birds: fair && !night ? (0.012 + outside * 0.21 + glass * 0.04) * focus : 0,
    crickets: fair && night ? (0.003 + outside * 0.082 + glass * 0.012) * focus : 0,
    effects: 0.32 * (1 - outside) * (1 - glass * 0.65) * focus,
  };
}

export function soundVolume(value: number) {
  return 0.85 * Math.pow(clamp01(Number.isFinite(value) ? value / 100 : 0), 1.4);
}

function glide(parameter: AudioParam, target: number, time: number, seconds = 0.45) {
  parameter.cancelAndHoldAtTime(time);
  parameter.setTargetAtTime(target, time, seconds);
}

export const SOUND_FILES = ['rain', 'glass', 'wind', 'crickets', 'bird-a', 'bird-b', 'swish-a', 'swish-b', 'bounce'] as const;
export type SoundName = typeof SOUND_FILES[number];
export type SoundSamples = Record<SoundName, AudioBuffer>;

/** Local recordings are fetched once, only after the user enables sound. */
export async function loadSoundscapeSamples(context: BaseAudioContext, signal?: AbortSignal): Promise<SoundSamples> {
  const samples = await Promise.all(SOUND_FILES.map(async name => {
    const response = await fetch(`/audio/factory/${name}.mp3`, { signal });
    if (!response.ok) throw new Error(`Sound asset unavailable: ${name}`);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    return [name, buffer] as const;
  }));
  return Object.fromEntries(samples) as SoundSamples;
}

/** Recorded textures retain their timing; only distance, weather and volume alter the mix. */
export function createSoundscape(context: BaseAudioContext, samples: SoundSamples, destination: AudioNode = context.destination) {
  const master = context.createGain();
  master.gain.value = 0; master.connect(destination);
  const nodes: AudioNode[] = [master];
  const sources = new Set<AudioBufferSourceNode>();
  const loops: Array<{ name: SoundName; input: AudioNode; next: number }> = [];
  let disposed = false;
  const overlap = 1.5;
  const fadeIn = Float32Array.from({ length: 48 }, (_, i) => Math.sin(i / 47 * Math.PI / 2));
  const fadeOut = Float32Array.from(fadeIn).reverse();

  function release(source: AudioBufferSourceNode, chain: AudioNode[]) {
    sources.add(source);
    source.onended = () => {
      sources.delete(source); source.disconnect(); chain.forEach(node => node.disconnect());
    };
  }
  function bus() {
    const level = context.createGain(); level.gain.value = 0; level.connect(master);
    nodes.push(level); return level;
  }
  function bed(name: SoundName, cutoff: number) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = 0.5;
    const level = bus(); filter.connect(level); nodes.push(filter);
    loops.push({ name, input: filter, next: context.currentTime });
    return { level, filter };
  }
  const rain = bed('rain', 1200);
  const glass = bed('glass', 2600);
  const wind = bed('wind', 1800);
  const crickets = bed('crickets', 5200);
  const birds = bus();
  const effects = bus();

  function pump() {
    for (const loop of loops) {
      if (loop.next > context.currentTime + 0.5) continue;
      const buffer = samples[loop.name];
      const duration = buffer.duration;
      const fade = Math.min(overlap, duration / 3);
      const start = Math.max(loop.next, context.currentTime);
      const source = context.createBufferSource(); source.buffer = buffer;
      const envelope = context.createGain(); envelope.gain.value = 0;
      envelope.gain.setValueCurveAtTime(fadeIn, start, fade);
      envelope.gain.setValueCurveAtTime(fadeOut, start + duration - fade, fade);
      source.connect(envelope).connect(loop.input);
      release(source, [envelope]);
      source.start(start); source.stop(start + duration);
      loop.next = start + duration - fade;
    }
  }
  function oneShot(name: SoundName, target: GainNode, gain: number, rate = 1, pan = 0.1) {
    if (disposed) return;
    const source = context.createBufferSource(); source.buffer = samples[name];
    source.playbackRate.value = rate;
    const duration = samples[name].duration / rate;
    const start = context.currentTime;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(gain, start + 0.012);
    envelope.gain.setValueAtTime(gain, start + Math.max(0.013, duration - 0.04));
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    const panner = context.createStereoPanner(); panner.pan.value = pan;
    source.connect(envelope).connect(panner).connect(target);
    release(source, [envelope, panner]);
    source.start(start); source.stop(start + duration);
  }

  return {
    setVolume(value: number, seconds = 0.25) {
      if (!disposed) glide(master.gain, soundVolume(value), context.currentTime, seconds);
    },
    update(environment: SoundEnvironment) {
      const mix = soundscapeMix(environment);
      if (disposed) return mix;
      const t = context.currentTime;
      pump();
      glide(rain.level.gain, mix.rain, t);
      glide(rain.filter.frequency, mix.rainCutoff, t);
      glide(glass.level.gain, mix.windowRain, t);
      glide(wind.level.gain, mix.wind, t, 1.2);
      glide(crickets.level.gain, mix.crickets, t);
      glide(birds.gain, mix.birds, t, 0.25);
      glide(effects.gain, mix.effects, t);
      return mix;
    },
    ballTap(energy = 1) { oneShot('bounce', effects, 0.22 * clamp01(energy), 1.08); },
    ballBounce(energy = 1) { oneShot('bounce', effects, 0.38 * clamp01(energy), 0.94 + Math.random() * 0.06); },
    ballSwish() { oneShot(Math.random() < 0.5 ? 'swish-a' : 'swish-b', effects, 0.5, 0.96 + Math.random() * 0.06); },
    bird() { oneShot(Math.random() < 0.5 ? 'bird-a' : 'bird-b', birds, 0.85, 1, Math.random() * 1.2 - 0.6); },
    get activeSourceCount() { return sources.size; },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const source of sources) source.stop();
      nodes.forEach(node => node.disconnect());
    },
  };
}
