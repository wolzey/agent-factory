export class LoginOverlay {
  private loginBtn: HTMLButtonElement;
  private modal: HTMLDivElement;
  private badge: HTMLDivElement;
  private errorEl: HTMLDivElement;

  constructor(
    private onLogin: () => void,
    private onLogout: () => void,
  ) {
    this.loginBtn = this.createLoginButton();
    this.modal = this.createModal();
    this.badge = this.createBadge();
    this.errorEl = this.modal.querySelector('.login-error') as HTMLDivElement;

    document.body.appendChild(this.loginBtn);
    document.body.appendChild(this.modal);
    document.body.appendChild(this.badge);
  }

  showLoggedIn(username: string): void {
    this.loginBtn.style.display = 'none';
    this.modal.style.display = 'none';
    this.badge.style.display = 'block';
    this.badge.querySelector('.badge-name')!.textContent = username;
    this.errorEl.textContent = '';
    this.onLogin();
  }

  showLoggedOut(): void {
    this.loginBtn.style.display = 'block';
    this.modal.style.display = 'none';
    this.badge.style.display = 'none';
  }

  showError(msg: string): void {
    this.loginBtn.style.display = 'none';
    this.badge.style.display = 'none';
    this.modal.style.display = 'flex';
    this.errorEl.textContent = msg;
  }

  private createLoginButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'login-btn';
    btn.textContent = 'Login';
    btn.addEventListener('click', () => {
      this.modal.style.display = 'flex';
      this.loginBtn.style.display = 'none';
    });
    return btn;
  }

  private createModal(): HTMLDivElement {
    const modal = document.createElement('div');
    modal.id = 'login-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="login-box">
        <div class="login-title">Connect This Browser</div>
        <div class="login-hint">Run <code>agent-factory login</code> on the machine whose agents you want to control. Your browser stays connected for one year and renews whenever you return.</div>
        <div class="login-error"></div>
        <div class="login-actions">
          <button class="login-cancel">Close</button>
        </div>
      </div>
    `;

    modal.querySelector('.login-cancel')!.addEventListener('click', () => {
      this.modal.style.display = 'none';
      this.loginBtn.style.display = 'block';
      this.errorEl.textContent = '';
    });

    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
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
      this.onLogout();
    });

    return badge;
  }
}
