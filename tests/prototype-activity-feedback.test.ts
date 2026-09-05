import { describe, expect, it } from 'vitest';
import { ActivityFeedbackModel, activityStatus } from '../client/prototypes/factory25dActivityFeedback';
import { StateManager } from '../server/state';
import { WORKSTATIONS } from '../shared/factory25d-layout';
import { DEFAULT_AVATAR } from '../shared/constants';
import type { EffectType, WorldAgent } from '../shared/types';

function fixture() {
  let now = 10_000;
  const state = new StateManager('factory25d', () => now);
  const feedback = new ActivityFeedbackModel(() => now);
  state.onStateChange(change => {
    if (change.type === 'delta') feedback.sync(state.getSnapshot());
    else feedback.effect({ type: 'effect', sessionId: change.sessionId, effect: change.effect, data: change.effectData });
  });
  const hook = (name: string, fields: Record<string, unknown> = {}, sessionId = 'ada') => state.handleHookEvent({
    hook_event_name: name, session_id: sessionId, username: sessionId, cwd: '/project/factory', avatar: DEFAULT_AVATAR, ...fields,
  });
  const effect = (type: EffectType, data?: Record<string, unknown>, sessionId = 'ada') => feedback.effect({ type: 'effect', sessionId, effect: type, data });
  const syncAgent = (agent: WorldAgent) => feedback.sync({ ...state.getSnapshot(), agents: [agent] });
  hook('SessionStart');
  return { state, feedback, hook, effect, syncAgent, advance: (ms: number) => { now += ms; } };
}

describe('live activity feedback', () => {
  it('follows actual permission, thinking, planning and compaction hooks and clears stale permission state', () => {
    const { hook, feedback } = fixture();
    hook('PreToolUse', { tool_name: 'Read' });
    expect(feedback.get('ada')?.status).toMatchObject({ kind: 'working', label: 'Reading · Read' });
    hook('PermissionRequest');
    expect(feedback.get('ada')?.status).toMatchObject({ kind: 'waiting', glyph: '?', label: 'Waiting for permission' });
    hook('UserPromptSubmit');
    expect(feedback.get('ada')?.status).toMatchObject({ kind: 'thinking', glyph: '···' });
    hook('PreToolUse', { tool_name: 'EnterPlanMode' });
    expect(feedback.get('ada')?.status).toMatchObject({ kind: 'planning', label: 'Planning' });
    hook('PreCompact');
    expect(feedback.get('ada')?.status).toMatchObject({ kind: 'compacting', label: 'Compacting context' });
    hook('PostCompact');
    expect(feedback.get('ada')).toMatchObject({ status: { kind: 'thinking' }, visibleNotice: { text: 'Context compacted' } });
    hook('Elicitation');
    expect(feedback.get('ada')?.status.label).toBe('Waiting for your input');
    expect(activityStatus('waiting').label).toBe('Waiting for permission or input');
  });

  it('keeps actual notification and failure text available after the compact bubble expires', () => {
    const { hook, feedback, advance } = fixture();
    const message = '<img src=x onerror=alert(1)>\nYour command needs permission before it can continue.';
    hook('Notification', { message });
    expect(feedback.get('ada')?.visibleNotice?.text).toBe(message);
    advance(6500);
    expect(feedback.get('ada')?.visibleNotice).toBeUndefined();
    expect(feedback.get('ada')?.notice?.text).toBe(message);
    hook('PostToolUseFailure', { tool_name: 'Bash', reason: 'Build failed: missing src/config.ts' });
    expect(feedback.get('ada')?.visibleNotice).toMatchObject({ kind: 'error', text: 'Bash: Build failed: missing src/config.ts' });
    advance(11_000);
    expect(feedback.get('ada')?.visibleNotice).toBeUndefined();
    expect(feedback.get('ada')?.notice?.text).toBe('Bash: Build failed: missing src/config.ts');
  });

  it('drives every indoor and patio station from real tool counts and releases heat with its occupant', () => {
    const { state, hook, feedback, syncAgent } = fixture();
    for (let index = 0; index < 18; index++) {
      const id = index === 0 ? 'ada' : `worker-${index}`;
      if (index > 0) hook('SessionStart', {}, id);
      hook('PreToolUse', { tool_name: 'Read' }, id);
    }
    const stations = feedback.stationStates();
    expect([...stations.values()].filter(station => station.active)).toHaveLength(18);
    expect(WORKSTATIONS.filter(station => station.room === 'patio' && stations.get(station.id)?.active)).toHaveLength(6);
    const ada = state.get('ada')!;
    syncAgent({ ...ada, toolUseCount: 1000 });
    expect(feedback.stationStates().get(WORKSTATIONS[ada.world.slotIndex!].id)).toMatchObject({ active: true, heat: 1, status: 'working', color: '#dbad68' });
    syncAgent({ ...ada, manualControl: { x: 1, y: 1, facing: 'down', moving: false } });
    expect([...feedback.stationStates().values()].every(station => !station.active && station.heat === 0)).toBe(true);
    syncAgent({ ...ada, activity: 'stopped' });
    expect([...feedback.stationStates().values()].every(station => !station.active && station.heat === 0)).toBe(true);
  });

  it('shows a subdued error only on the failed station, then clears it when the tool recovers', () => {
    const { state, hook, feedback, advance } = fixture();
    hook('PreToolUse', { tool_name: 'Read' });
    const id = WORKSTATIONS[state.get('ada')!.world.slotIndex!].id;
    hook('PostToolUseFailure', { tool_name: 'Read', reason: 'File is unavailable' });
    expect(feedback.stationStates().get(id)).toMatchObject({ error: 1, status: 'error', color: '#da8278' });
    expect([...feedback.stationStates().entries()].filter(([station]) => station !== id).every(([, state]) => state.error === 0)).toBe(true);
    advance(3250);
    expect(feedback.stationStates().get(id)?.error).toBeCloseTo(0.5);
    hook('PostToolUse', { tool_name: 'Read' });
    expect(feedback.stationStates().get(id)).toMatchObject({ error: 0, status: 'working', pulse: 1 });
    advance(1500);
    expect(feedback.stationStates().get(id)?.pulse).toBe(0);
  });

  it('does not transfer an old error to a different agent or a newly assigned patio station', () => {
    const { state, hook, feedback, syncAgent } = fixture();
    hook('PreToolUse', { tool_name: 'Bash' });
    hook('PostToolUseFailure', { tool_name: 'Bash', reason: 'Test failed' });
    const ada = state.get('ada')!, oldStation = WORKSTATIONS[ada.world.slotIndex!].id;
    syncAgent({ ...ada, world: { ...ada.world, slotIndex: 17 } });
    expect(feedback.stationStates().get(WORKSTATIONS[17].id)).toMatchObject({ active: true, error: 0 });
    syncAgent({ ...ada, sessionId: 'grace', username: 'grace' });
    expect(feedback.stationStates().get(oldStation)).toMatchObject({ active: true, error: 0 });
    expect(feedback.get('ada')).toBeUndefined();
  });

  it('keeps the first batched notification and ignores stale or non-text payloads', () => {
    const { state } = fixture();
    let now = 100;
    const model = new ActivityFeedbackModel(() => now);
    model.effect({ type: 'effect', sessionId: 'ada', effect: 'notification', data: { message: 'Ready for your input' } });
    expect(model.sync(state.getSnapshot())).toHaveLength(1);
    expect(model.get('ada')?.visibleNotice?.text).toBe('Ready for your input');
    expect(model.effect({ type: 'effect', sessionId: 'ada', effect: 'notification', data: { message: { html: 'not a notification' } } })).toBeUndefined();
    model.clear();
    model.effect({ type: 'effect', sessionId: 'ada', effect: 'notification', data: { message: 'stale' } });
    now += 2001;
    expect(model.sync(state.getSnapshot())).toEqual([]);
    expect(model.get('ada')?.notice).toBeUndefined();
  });

  it('deduplicates event bursts, bounds displayed text, and disposes all remembered activity', () => {
    const { feedback, effect, advance } = fixture();
    expect(effect('notification', { message: 'Needs review' })).toBeDefined();
    expect(effect('notification', { message: 'Needs review' })).toBeUndefined();
    advance(1600);
    expect(effect('notification', { message: 'Needs review' })).toBeDefined();
    effect('error', { tool: 'Bash', reason: 'x'.repeat(3000) });
    expect(feedback.get('ada')?.notice?.text).toHaveLength(1000);
    feedback.clear();
    expect(feedback.get('ada')).toBeUndefined();
    expect([...feedback.stationStates().values()].every(station => !station.active && !station.error && !station.pulse)).toBe(true);
  });
});
