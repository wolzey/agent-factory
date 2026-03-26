import type { WebSocket } from '@fastify/websocket';
import type { WSMessageToClient, AgentSession, EffectType, ChatMessage } from '../../shared/types.js';

interface SocketMeta {
  username?: string;
}

export class BroadcastManager {
  private clients = new Map<WebSocket, SocketMeta>();

  add(ws: WebSocket) {
    this.clients.set(ws, {});
    ws.on('close', () => this.clients.delete(ws));
    ws.on('error', () => this.clients.delete(ws));
  }

  get clientCount(): number {
    return this.clients.size;
  }

  authenticateSocket(ws: WebSocket, username: string): void {
    const meta = this.clients.get(ws);
    if (meta) meta.username = username;
  }

  getSocketUsername(ws: WebSocket): string | undefined {
    return this.clients.get(ws)?.username;
  }

  sendTo(ws: WebSocket, msg: WSMessageToClient) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  sendFullState(ws: WebSocket, agents: AgentSession[]) {
    this.sendTo(ws, { type: 'full_state', agents });
  }

  broadcastAgentUpdate(agent: AgentSession) {
    this.broadcast({ type: 'agent_update', agent });
  }

  broadcastAgentRemove(sessionId: string) {
    this.broadcast({ type: 'agent_remove', sessionId });
  }

  broadcastEffect(sessionId: string, effect: EffectType, data?: Record<string, unknown>) {
    this.broadcast({ type: 'effect', sessionId, effect, data });
  }

  broadcastChatMessage(chat: ChatMessage) {
    this.broadcast({ type: 'chat_message', chat });
  }

  private broadcast(msg: WSMessageToClient) {
    const raw = JSON.stringify(msg);
    for (const [client] of this.clients) {
      if (client.readyState === 1) {
        client.send(raw);
      }
    }
  }
}
