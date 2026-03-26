import type { AuthManager } from '../auth/AuthManager';
import type { SocketClient } from '../network/socket';

export class LoginOverlay {
  private loginBtn: HTMLButtonElement;
  private modal: HTMLDivElement;
  private badge: HTMLDivElement;
  private tokenInput: HTMLInputElement;
  private errorEl: HTMLDivElement;

  constructor(
    private auth: AuthManager,
    private socket: SocketClient,
    private onLogin: () => void,
    private onLogout: () => void,
  ) {
    this.loginBtn = this.createLoginButton();
    this.modal = this.createModal();
    this.badge = this.createBadge();
    this.tokenInput = this.modal.querySelector('.login-token-input') as HTMLInputElement;
    this.errorEl = this.modal.querySelector('.login-error') as HTMLDivElement;

    document.body.appendChild(this.loginBtn);
    document.body.appendChild(this.modal);
    document.body.appendChild(this.badge);

    if (auth.isLoggedIn) {
      this.showLoggedIn(auth.username!);
    }
  }

  showLoggedIn(username: string): void {
    this.loginBtn.style.display = 'none';
    this.modal.style.display = 'none';
    this.badge.style.display = 'block';
    this.badge.querySelector('.badge-name')!.textContent = username;
    this.errorEl.textContent = '';
    this.tokenInput.value = '';
    this.onLogin();
  }

  showLoggedOut(): void {
    this.loginBtn.style.display = 'block';
    this.modal.style.display = 'none';
    this.badge.style.display = 'none';
    this.onLogout();
  }

  showError(msg: string): void {
    this.errorEl.textContent = msg;
  }

  private createLoginButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'login-btn';
    btn.textContent = 'Login';
    btn.addEventListener('click', () => {
      this.modal.style.display = 'flex';
      this.loginBtn.style.display = 'none';
      this.tokenInput.focus();
    });
    return btn;
  }

  private createModal(): HTMLDivElement {
    const modal = document.createElement('div');
    modal.id = 'login-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="login-box">
        <div class="login-title">Login with Token</div>
        <div class="login-hint">Run <code>agent-factory token</code> to get your token</div>
        <input type="text" class="login-token-input" placeholder="Paste your token here" autocomplete="off" spellcheck="false" />
        <div class="login-error"></div>
        <div class="login-actions">
          <button class="login-submit">Login</button>
          <button class="login-cancel">Cancel</button>
        </div>
      </div>
    `;

    const submit = () => {
      const token = this.tokenInput.value.trim();
      if (!token) return;
      this.errorEl.textContent = '';
      this.socket.send({ type: 'auth', token });
    };

    modal.querySelector('.login-submit')!.addEventListener('click', submit);
    modal.querySelector('.login-cancel')!.addEventListener('click', () => {
      this.modal.style.display = 'none';
      this.loginBtn.style.display = 'block';
      this.errorEl.textContent = '';
      this.tokenInput.value = '';
    });

    // Enter key submits
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') {
        this.modal.style.display = 'none';
        this.loginBtn.style.display = 'block';
      }
    });

    return modal;
  }

  private createBadge(): HTMLDivElement {
    const badge = document.createElement('div');
    badge.id = 'user-badge';
    badge.style.display = 'none';
    badge.innerHTML = `
      <span class="badge-name"></span>
      <span class="badge-logout">logout</span>
    `;

    badge.querySelector('.badge-logout')!.addEventListener('click', () => {
      this.auth.logout();
      this.showLoggedOut();
    });

    return badge;
  }
}
