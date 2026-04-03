import type { WSMessageToClient } from '@shared/types';

type MessageHandler = (msg: WSMessageToClient) => void;

export class SocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: MessageHandler[] = [];
  private connectHandlers: (() => void)[] = [];
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private intentionalClose = false;

  constructor(url?: string) {
    // In dev mode, Vite proxies /ws to the server
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = url || `${protocol}//${window.location.host}/ws`;
  }

  connect() {
    this.intentionalClose = false;
    this.attemptConnect();
  }

  disconnect() {
    this.intentionalClose = true;
    this.ws?.close();
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
  }

  onConnect(handler: () => void) {
    this.connectHandlers.push(handler);
  }

  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private attemptConnect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[socket] Connected to Agent Factory server');
        this.reconnectDelay = 1000;
        this.updateHud(true);
        for (const handler of this.connectHandlers) handler();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSMessageToClient;
          for (const handler of this.handlers) {
            handler(msg);
          }
        } catch (err) {
          console.error('[socket] Error processing message:', err);
        }
      };

      this.ws.onclose = () => {
        this.updateHud(false);
        if (!this.intentionalClose) {
          console.log(`[socket] Disconnected. Reconnecting in ${this.reconnectDelay}ms...`);
          setTimeout(() => this.attemptConnect(), this.reconnectDelay);
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        }
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      setTimeout(() => this.attemptConnect(), this.reconnectDelay);
    }
  }

  private updateHud(connected: boolean) {
    const el = document.getElementById('hud-connected');
    if (el) {
      el.textContent = connected ? 'yes' : 'no';
      el.style.color = connected ? '#00ff00' : '#ff0000';
    }
  }
}
