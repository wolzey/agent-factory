const STORAGE_KEY_TOKEN = 'af_token';
const STORAGE_KEY_USERNAME = 'af_username';

export class AuthManager {
  private _token: string | null = null;
  private _username: string | null = null;

  constructor() {
    this.loadFromStorage();
  }

  get isLoggedIn(): boolean {
    return !!this._token && !!this._username;
  }

  get username(): string | null {
    return this._username;
  }

  get token(): string | null {
    return this._token;
  }

  login(token: string, username: string): void {
    this._token = token;
    this._username = username;
    localStorage.setItem(STORAGE_KEY_TOKEN, token);
    localStorage.setItem(STORAGE_KEY_USERNAME, username);
  }

  logout(): void {
    this._token = null;
    this._username = null;
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USERNAME);
  }

  private loadFromStorage(): void {
    this._token = localStorage.getItem(STORAGE_KEY_TOKEN);
    this._username = localStorage.getItem(STORAGE_KEY_USERNAME);
  }
}
