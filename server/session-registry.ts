import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SESSIONS_DIR = join(homedir(), '.claude', 'sessions');
const POLL_INTERVAL_MS = 5_000;

interface SessionRegistryEntry {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  name?: string;
}

export type NameChangeCallback = (sessionId: string, name: string) => void;

export class SessionRegistryWatcher {
  private cache = new Map<string, string | undefined>(); // sessionId -> name
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private onChange: NameChangeCallback) {}

  start(): void {
    // Initial poll immediately
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getSessionName(sessionId: string): string | undefined {
    return this.cache.get(sessionId);
  }

  /** Returns true if the session still has a file in ~/.claude/sessions/ */
  isSessionAlive(sessionId: string): boolean {
    return this.cache.has(sessionId);
  }

  /** Returns all session IDs currently in the registry */
  getAliveSessionIds(): Set<string> {
    return new Set(this.cache.keys());
  }

  private async poll(): Promise<void> {
    let files: string[];
    try {
      files = await readdir(SESSIONS_DIR);
    } catch {
      return; // Directory doesn't exist or isn't readable
    }

    const seen = new Set<string>();

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const raw = await readFile(join(SESSIONS_DIR, file), 'utf-8');
        const entry: SessionRegistryEntry = JSON.parse(raw);

        if (!entry.sessionId) continue;
        seen.add(entry.sessionId);

        const prevName = this.cache.get(entry.sessionId);
        this.cache.set(entry.sessionId, entry.name);

        if (entry.name && entry.name !== prevName) {
          this.onChange(entry.sessionId, entry.name);
        }
      } catch {
        // File disappeared or malformed JSON — skip
      }
    }

    // Prune cache entries for sessions whose files no longer exist
    for (const id of this.cache.keys()) {
      if (!seen.has(id)) this.cache.delete(id);
    }
  }
}
