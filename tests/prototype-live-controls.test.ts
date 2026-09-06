import { expect, it } from 'vitest';
import { FactoryControlState, factoryControlPhase } from '../client/prototypes/factory25dControlState';
import { StateManager } from '../server/state';
import { DEFAULT_AVATAR } from '../shared/constants';
import type { WSMessageToServer } from '../shared/types';
function setup() {
  const world = new StateManager('factory25d', () => 1000);
  for (const id of ['mine','theirs']) world.handleHookEvent({ hook_event_name:'SessionStart',session_id:id,username:id,ownerId:id,cwd:'/work',avatar:DEFAULT_AVATAR });
  const sent: WSMessageToServer[]=[];
  const state = new FactoryControlState(message => { sent.push(message); return true; });
  state.sync(world.getSnapshot().agents,'mine'); return {state,sent,world};
}
it('waits for a matching server grant and prevents cross-owner claims', () => {
  const {state,sent}=setup();
  expect(state.claim('theirs')).toBe(false); expect(sent).toHaveLength(0);
  expect(state.claim('mine')).toBe(true); expect(state.active).toBeUndefined();
  state.handle({type:'control_result',action:'claim',success:true,sessionId:'theirs'});
  expect(state.active).toBeUndefined();
  state.claim('mine'); state.handle({type:'control_result',action:'claim',success:true,sessionId:'mine'});
  expect(state.active).toBe('mine');
});
it('sends stop input before releasing and clears control when a session ends', () => {
  const {state,sent}=setup(); state.claim('mine'); state.handle({type:'control_result',action:'claim',success:true,sessionId:'mine'});
  state.move('up',true); state.release();
  expect(sent.slice(-2)).toEqual([{type:'control_input',sessionId:'mine',input:{up:false,down:false,left:false,right:false}},{type:'control_release',sessionId:'mine'}]);
  state.claim('mine'); state.handle({type:'control_result',action:'claim',success:true,sessionId:'mine'});
  state.sync([],'mine'); expect(state.active).toBeUndefined();
});
it('handles takeover, disconnect, and cancellation while a claim is pending', () => {
  const {state,sent}=setup(); state.claim('mine'); state.release();
  state.handle({type:'control_result',action:'claim',success:true,sessionId:'mine'}); expect(state.active).toBeUndefined();
  expect(sent.at(-1)).toEqual({type:'control_release',sessionId:'mine'});
  state.claim('mine'); state.handle({type:'control_result',action:'claim',success:true,sessionId:'mine'});
  state.handle({type:'control_revoked',sessionId:'mine',reason:'Another browser took control'});
  expect(state.active).toBeUndefined(); expect(state.error).toContain('Another browser');
  state.reset(); expect(state.shoot()).toBe(false);
});
it('follows the connection flow and requires a grant before showing movement', () => {
  const { state, world } = setup();
  state.sync(world.getSnapshot().agents);
  expect(factoryControlPhase(state, true)).toBe('watching');
  expect(factoryControlPhase(state, true, true)).toBe('connecting');
  state.sync([], 'mine'); expect(factoryControlPhase(state, true)).toBe('empty');
  state.sync(world.getSnapshot().agents, 'mine'); expect(factoryControlPhase(state, true)).toBe('ready');
  state.claim('mine'); expect(factoryControlPhase(state, true)).toBe('claiming');
  state.handle({ type:'control_result', action:'claim', sessionId:'mine', success:true });
  expect(factoryControlPhase(state, true)).toBe('controlling');
  expect(factoryControlPhase(state, false)).toBe('reconnecting');
  state.release(); expect(factoryControlPhase(state, true)).toBe('ready');
});
it('keeps a new claim pending when an older release acknowledgement arrives', () => {
  const { state } = setup();
  state.claim('mine'); state.release(); state.claim('mine');
  state.handle({ type:'control_result', action:'release', sessionId:'mine', success:true });
  expect(state.pending).toBe('mine');
  state.handle({ type:'control_result', action:'claim', sessionId:'mine', success:true });
  expect(state.active).toBe('mine');
});
it('cancels a pending grant when the agent disappears or ownership changes', () => {
  const { state, world } = setup();
  state.claim('mine'); state.sync([], 'mine');
  state.handle({ type:'control_result', action:'claim', sessionId:'mine', success:true });
  expect(state.active).toBeUndefined();
  state.sync(world.getSnapshot().agents, 'mine'); state.claim('mine');
  state.sync(world.getSnapshot().agents, 'theirs');
  state.handle({ type:'control_result', action:'claim', sessionId:'mine', success:true });
  expect(state.active).toBeUndefined(); expect(state.pending).toBeUndefined();
});
it('shows a recoverable failure when sending or claiming is rejected', () => {
  const { state, world } = setup(); state.claim('mine');
  state.handle({ type:'control_result', action:'claim', sessionId:'mine', success:false, error:'Already controlled' });
  expect(factoryControlPhase(state, true)).toBe('error'); expect(state.active).toBeUndefined();
  state.claim('mine'); expect(state.error).toBe(''); expect(factoryControlPhase(state, true)).toBe('claiming');
  const offline = new FactoryControlState(() => false); offline.sync(world.getSnapshot().agents, 'mine');
  expect(offline.claim('mine')).toBe(false); expect(offline.pending).toBeUndefined();
  expect(factoryControlPhase(offline, true)).toBe('error');
});
