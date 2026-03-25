import type { FastifyInstance } from 'fastify';
import type { HookPayload, ServerConfig, EmoteType } from '../../shared/types.js';
import { VALID_EMOTES } from '../../shared/constants.js';
import type { StateManager } from '../state.js';
import type { BroadcastManager } from '../ws/broadcast.js';

export function registerHookRoutes(
  app: FastifyInstance,
  state: StateManager,
  broadcast: BroadcastManager,
  serverConfig: ServerConfig,
) {
  app.post<{ Body: HookPayload }>('/api/hooks', async (request, reply) => {
    const payload = request.body;

    if (!payload || !payload.session_id) {
      return reply.status(400).send({ error: 'Missing session_id' });
    }

    // Default hook_event_name if missing
    if (!payload.hook_event_name) {
      return reply.status(400).send({ error: 'Missing hook_event_name' });
    }

    state.handleHookEvent(payload);
    return reply.status(200).send({ ok: true });
  });

  app.post<{ Body: { username: string; emote: string } }>('/api/emote', async (request, reply) => {
    const { username, emote } = request.body || {};

    if (!username || !emote) {
      return reply.status(400).send({ error: 'Missing username or emote' });
    }

    if (!VALID_EMOTES.includes(emote as EmoteType)) {
      return reply.status(400).send({ error: `Invalid emote. Valid: ${VALID_EMOTES.join(', ')}` });
    }

    const session = state.findSessionByUsername(username);
    if (!session) {
      return reply.status(404).send({ error: 'No active session for username' });
    }

    state.emitEmote(session.sessionId, emote);
    return reply.status(200).send({ ok: true, sessionId: session.sessionId });
  });

  app.get('/api/config', async (_request, reply) => {
    return reply.send(serverConfig);
  });

  app.get('/api/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      agents: state.getAll().length,
      clients: broadcast.clientCount,
      uptime: process.uptime(),
    });
  });

  app.get('/api/state', async (_request, reply) => {
    return reply.send({ agents: state.getAll() });
  });
}
