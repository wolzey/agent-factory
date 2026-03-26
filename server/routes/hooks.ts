import type { FastifyInstance } from 'fastify';
import type { HookPayload, ServerConfig, EmoteType, ChatMessage } from '../../shared/types.js';
import { VALID_EMOTES, CHAT_MESSAGE_MAX_LENGTH } from '../../shared/constants.js';
import type { StateManager } from '../state.js';
import type { BroadcastManager } from '../ws/broadcast.js';
import type { TokenAuth } from '../auth.js';

export function registerHookRoutes(
  app: FastifyInstance,
  state: StateManager,
  broadcast: BroadcastManager,
  serverConfig: ServerConfig,
  auth: TokenAuth,
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

  app.post<{ Body: { username: string; message: string } }>('/api/chat', async (request, reply) => {
    const { username, message } = request.body || {};

    if (!username || !message) {
      return reply.status(400).send({ error: 'Missing username or message' });
    }

    if (message.length > CHAT_MESSAGE_MAX_LENGTH) {
      return reply.status(400).send({ error: `Message too long (max ${CHAT_MESSAGE_MAX_LENGTH} chars)` });
    }

    const chat: ChatMessage = {
      username,
      message,
      timestamp: Date.now(),
    };

    broadcast.broadcastChatMessage(chat);
    return reply.status(200).send({ ok: true });
  });

  app.post<{ Body: { username?: string; session_id?: string; summary: string } }>('/api/context', async (request, reply) => {
    const { username, session_id, summary } = request.body || {};

    if (!summary) {
      return reply.status(400).send({ error: 'Missing summary' });
    }

    let session = session_id ? state.get(session_id) : undefined;
    if (!session && username) {
      session = state.findSessionByUsername(username);
    }

    if (!session) {
      return reply.status(404).send({ error: 'No active session found' });
    }

    session.taskDescription = summary.slice(0, 200);
    session.lastEventAt = Date.now();
    state.emitUpdate(session);
    return reply.status(200).send({ ok: true, sessionId: session.sessionId });
  });

  app.get<{ Querystring: { username?: string } }>('/api/auth/token', async (request, reply) => {
    const username = request.query.username;
    if (!username) {
      return reply.status(400).send({ error: 'Missing username query param' });
    }

    // Restrict to localhost
    const ip = request.ip;
    if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
      return reply.status(403).send({ error: 'Token generation is localhost-only' });
    }

    const token = auth.generateToken(username);
    return reply.send({ token });
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
