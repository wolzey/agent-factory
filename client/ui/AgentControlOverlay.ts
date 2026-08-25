import type { AgentSession } from '@shared/types';

function sessionLabel(agent: AgentSession): string {
  const project = agent.cwd.split('/').filter(Boolean).pop() || 'unknown project';
  const name = agent.sessionName || project;
  return `${name} · ${agent.activity} · ${agent.sessionId.slice(0, 7)}`;
}

export class AgentControlOverlay {
  private root: HTMLDivElement;
  private select: HTMLSelectElement;
  private claimButton: HTMLButtonElement;
  private releaseButton: HTMLButtonElement;
  private status: HTMLDivElement;
  private error: HTMLDivElement;
  private username: string | null = null;
  private agents: AgentSession[] = [];
  private controlledSessionId: string | null = null;

  constructor(
    private onClaim: (sessionId: string) => void,
    private onRelease: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'agent-control-panel';
    this.root.style.display = 'none';
    this.root.innerHTML = `
      <div class="control-kicker">AVATAR UPLINK</div>
      <div class="control-owner"></div>
      <div class="control-picker-row">
        <select class="control-agent-select" aria-label="Choose an agent to control"></select>
        <button class="control-claim">TAKE CONTROL</button>
      </div>
      <div class="control-status">Choose one of your active agents.</div>
      <div class="control-keys"><b>WASD</b> MOVE <span>·</span> <b>B</b> EMOTES <span>·</span> <b>SPACE</b> SHOOT <span>·</span> <b>ESC</b> RELEASE</div>
      <button class="control-release">RELEASE UPLINK</button>
      <div class="control-error" role="status"></div>
    `;

    this.select = this.root.querySelector('.control-agent-select') as HTMLSelectElement;
    this.claimButton = this.root.querySelector('.control-claim') as HTMLButtonElement;
    this.releaseButton = this.root.querySelector('.control-release') as HTMLButtonElement;
    this.status = this.root.querySelector('.control-status') as HTMLDivElement;
    this.error = this.root.querySelector('.control-error') as HTMLDivElement;

    this.select.addEventListener('change', () => this.render());
    this.claimButton.addEventListener('click', () => {
      if (this.select.value) this.onClaim(this.select.value);
    });
    this.releaseButton.addEventListener('click', () => this.onRelease());
    document.body.appendChild(this.root);
  }

  setAuthenticated(username: string | null): void {
    this.username = username;
    this.root.style.display = username ? 'block' : 'none';
    const owner = this.root.querySelector('.control-owner') as HTMLDivElement;
    owner.textContent = username ? `Authenticated as ${username}` : '';
    if (!username) {
      this.agents = [];
      this.controlledSessionId = null;
      this.render();
    }
  }

  updateAgents(agents: AgentSession[], preferredSessionId?: string | null): void {
    this.agents = [...agents].sort((a, b) => b.lastEventAt - a.lastEventAt);
    const currentSelection = this.select.value;
    const previous = this.agents.some(agent => agent.sessionId === currentSelection)
      ? currentSelection
      : (preferredSessionId || this.controlledSessionId);
    this.select.replaceChildren();

    if (this.agents.length === 0) {
      const option = document.createElement('option');
      option.textContent = 'No active agents attributed to you';
      option.value = '';
      this.select.appendChild(option);
    } else {
      for (const agent of this.agents) {
        const option = document.createElement('option');
        option.value = agent.sessionId;
        option.textContent = sessionLabel(agent);
        this.select.appendChild(option);
      }
      if (previous && this.agents.some(agent => agent.sessionId === previous)) {
        this.select.value = previous;
      }
    }
    this.render();
  }

  setControlled(sessionId: string | null): void {
    this.controlledSessionId = sessionId;
    if (sessionId && this.agents.some(agent => agent.sessionId === sessionId)) {
      this.select.value = sessionId;
    }
    this.error.textContent = '';
    this.render();
  }

  showError(message: string): void {
    this.error.textContent = message;
  }

  private render(): void {
    const controlled = this.agents.find(agent => agent.sessionId === this.controlledSessionId);
    const hasAgents = this.agents.length > 0;
    this.select.disabled = !hasAgents;
    this.claimButton.disabled = !hasAgents;
    this.releaseButton.style.display = controlled ? 'block' : 'none';
    this.root.classList.toggle('is-controlling', !!controlled);

    if (controlled) {
      const project = controlled.cwd.split('/').filter(Boolean).pop() || 'agent';
      this.status.textContent = `CONTROLLING ${controlled.sessionName || project}`;
      this.claimButton.textContent = this.select.value === controlled.sessionId ? 'CONNECTED' : 'SWITCH';
      this.claimButton.disabled = this.select.value === controlled.sessionId;
    } else if (!hasAgents && this.username) {
      this.status.textContent = 'Waiting for one of your agent sessions to appear.';
      this.claimButton.textContent = 'TAKE CONTROL';
    } else {
      this.status.textContent = 'Choose one of your active agents.';
      this.claimButton.textContent = 'TAKE CONTROL';
    }
  }
}
