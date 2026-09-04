const LEGACY_STORAGE_KEYS = ['af_token', 'af_username'];

interface BrowserSessionResponse {
  authenticated: boolean;
  username?: string;
  ownerId?: string;
}

export class AuthManager {
  private _username: string | null = null;
  private _ownerId: string | null = null;

  // Wrapped rather than stored bare: `this.fetcher(...)` would invoke the
  // browser's fetch with this AuthManager as `this`, which every browser
  // rejects ("Illegal invocation"), and loadSession's catch turned that into a
  // silent logged-out state and a misleading "link invalid or expired" error.
  constructor(private fetcher: typeof fetch = (input, init) => fetch(input, init)) {
    this.clearLegacyStorage();
  }

  get isLoggedIn(): boolean {
    return !!this._username && !!this._ownerId;
  }

  get username(): string | null {
    return this._username;
  }

  get ownerId(): string | null {
    return this._ownerId;
  }

  async restoreSession(): Promise<boolean> {
    return this.loadSession('/api/auth/session', { method: 'GET' });
  }

  async exchangeHandoff(code: string): Promise<boolean> {
    return this.loadSession('/api/auth/handoff/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  }

  completeLogin(username: string, ownerId: string): boolean {
    if (!username || !ownerId) return false;
    this._username = username;
    this._ownerId = ownerId;
    return true;
  }

  async logout(): Promise<void> {
    this._username = null;
    this._ownerId = null;
    try {
      await this.fetcher('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // Local state is still cleared; the cookie can be cleared on the next successful request.
    }
  }

  private async loadSession(url: string, init: RequestInit): Promise<boolean> {
    try {
      const response = await this.fetcher(url, { ...init, credentials: 'same-origin' });
      if (!response.ok) {
        this._username = null;
        this._ownerId = null;
        return false;
      }
      const session = await response.json() as BrowserSessionResponse;
      if (!session.authenticated || !session.username || !session.ownerId) {
        this._username = null;
        this._ownerId = null;
        return false;
      }
      return this.completeLogin(session.username, session.ownerId);
    } catch {
      this._username = null;
      this._ownerId = null;
      return false;
    }
  }

  private clearLegacyStorage(): void {
    if (typeof localStorage === 'undefined') return;
    for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);
  }
}
