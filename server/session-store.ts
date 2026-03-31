import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AgentSession } from '../shared/types.js';

const STORE_PATH = join(homedir(), '.claude', 'agent-factory-sessions.json');
const SAVE_DEBOUNCE_MS = 10_000;

export function loadSessions(): AgentSession[] {
  try {
    const raw = readFileSync(STORE_PATH, 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;
    return [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: AgentSession[]): void {
  try {
    writeFileSync(STORE_PATH, JSON.stringify(sessions), 'utf-8');
  } catch (err) {
    console.warn('[session-store] Failed to persist sessions:', err);
  }
}

/** Returns a debounced save function that writes at most every SAVE_DEBOUNCE_MS. */
export function createDebouncedSave(): (sessions: AgentSession[]) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: AgentSession[] | null = null;

  return (sessions: AgentSession[]) => {
    pending = sessions;
    if (!timer) {
      timer = setTimeout(() => {
        if (pending) saveSessions(pending);
        pending = null;
        timer = null;
      }, SAVE_DEBOUNCE_MS);
    }
  };
}
