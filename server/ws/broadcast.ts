import type { WebSocket } from '@fastify/websocket';
import type { WSMessageToClient, AgentSession, EffectType } from '../../shared/types.js';

export class BroadcastManager {
  private clients = new Set<WebSocket>();

  add(ws: WebSocket) {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
    ws.on('error', () => this.clients.delete(ws));
  }

  get clientCount(): number {
    return this.clients.size;
  }

  sendFullState(ws: WebSocket, agents: AgentSession[]) {
    this.send(ws, { type: 'full_state', agents });
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

  private broadcast(msg: WSMessageToClient) {
    const raw = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(raw);
      }
    }
  }

  private send(ws: WebSocket, msg: WSMessageToClient) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }
}
