import type { WebSocket } from '@fastify/websocket';
import type { AuthPrincipal } from '../auth.js';
import type {
  AgentSession,
  ChatMessage,
  EffectType,
  GlobalEffectType,
  GrabState,
  GrabTarget,
  WorldDelta,
  WorldSnapshot,
  WSMessageToClient,
} from '../../shared/types.js';

interface SocketMeta {
  principal?: AuthPrincipal;
}

/** Stable for the life of this process, so redeploys hand connected tabs a new value. */
export const SERVER_BUILD_ID = process.env.RENDER_GIT_COMMIT ?? `local-${Date.now().toString(36)}`;

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

  authenticateSocket(ws: WebSocket, principal: AuthPrincipal): void {
    const meta = this.clients.get(ws);
    if (meta) meta.principal = principal;
  }

  getSocketPrincipal(ws: WebSocket): AuthPrincipal | undefined {
    return this.clients.get(ws)?.principal;
  }

  deauthenticateSocket(ws: WebSocket): void {
    const meta = this.clients.get(ws);
    if (meta) delete meta.principal;
  }

  sendTo(ws: WebSocket, msg: WSMessageToClient) {
    if (ws.readyState !== 1) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      console.warn('[broadcast] Failed to send WebSocket message');
      this.clients.delete(ws);
    }
  }

  sendWorldSnapshot(ws: WebSocket, snapshot: WorldSnapshot) {
    this.sendTo(ws, { type: 'world_snapshot', snapshot, buildId: SERVER_BUILD_ID });
  }

  broadcastWorldDelta(delta: WorldDelta) {
    this.broadcast({ type: 'world_delta', delta });
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

  broadcastGlobalEffect(effect: GlobalEffectType, data?: Record<string, unknown>) {
    this.broadcast({ type: 'global_effect', effect, data });
  }

  broadcastChatMessage(chat: ChatMessage) {
    this.broadcast({ type: 'chat_message', chat });
  }

  broadcastGrab(grab: GrabState) {
    this.broadcast({ type: 'grab_update', grab });
  }

  broadcastGrabRelease(target: GrabTarget, x: number, y: number, reason: string) {
    this.broadcast({ type: 'grab_release', ...target, x, y, reason });
  }

  private broadcast(msg: WSMessageToClient) {
    const raw = JSON.stringify(msg);
    for (const [client] of this.clients) {
      if (client.readyState !== 1) continue;
      try {
        client.send(raw);
      } catch {
        console.warn('[broadcast] Failed to broadcast WebSocket message');
        this.clients.delete(client);
      }
    }
  }
}
