import { publicBranding } from '../../shared/factory-branding.js';
import type { FastifyInstance } from 'fastify';
import type { HookPayload, ServerConfig, EmoteType, ChatMessage } from '../../shared/types.js';
import { VALID_EMOTES, CHAT_MESSAGE_MAX_LENGTH } from '../../shared/constants.js';
import type { StateManager } from '../state.js';
import type { BroadcastManager } from '../ws/broadcast.js';
import type { AuthService } from '../auth.js';
import type { PersistenceStatus } from '../persistence/world-repository.js';
import type { RemoteSessionRegistry } from '../remote-registry.js';
import { normalizeHookPayload } from '../hook-payload.js';
import { isSameHostOrigin, usesSecureTransport } from '../request-security.js';
import { readBrowserPrincipal } from './auth.js';

export function registerHookRoutes(
  app: FastifyInstance,
  state: StateManager,
  broadcast: BroadcastManager,
  serverConfig: ServerConfig,
  auth: AuthService,
  getPersistenceStatus: () => PersistenceStatus,
  remoteRegistry: RemoteSessionRegistry,
) {
  app.post<{ Body: HookPayload }>('/api/hooks', async (request, reply) => {
    // Reduced to the fields the server uses before anything else touches it, so
    // a payload from an older hook cannot carry prompt text or tool input into
    // the world state, the broadcast, or libSQL.
    const payload = normalizeHookPayload(request.body);

    if (!payload) {
      return reply.status(400).send({ error: 'Missing session_id or hook_event_name' });
    }

    const device = auth.authenticateDevice(request.headers.authorization);
    if (device.kind === 'authenticated' && !usesSecureTransport(request)) {
      return reply.status(400).send({ error: 'HTTPS is required for installation authentication' });
    }
    if (device.kind === 'invalid') {
      return reply.status(401).send({ error: 'Invalid installation credential' });
    }

    const existing = state.get(payload.session_id);
    const incomingOwnerId = device.kind === 'authenticated' ? device.ownerId : undefined;
    if (existing?.ownerId && existing.ownerId !== incomingOwnerId) {
      return reply.status(403).send({ error: 'Agent session belongs to another installation' });
    }

    // Existing legacy sessions remain unowned. This prevents someone from claiming
    // a public legacy session ID after upgrading or observing it in world state.
    const ownerId = existing ? existing.ownerId : incomingOwnerId;
    const trustedPayload: HookPayload = { ...payload, ownerId };
    console.log(`[hook] event=${payload.hook_event_name} session=${payload.session_id} user=${payload.username || 'unknown'}`);
    state.handleHookEvent(trustedPayload);
    return reply.status(200).send({ ok: true });
  });

  // Machines running agents report which sessions are still open, so a server
  // that is not on that machine can keep them out of the stale reaper. A
  // session that goes quiet for 30 minutes while its terminal is still up --
  // parked on a question, or blocked behind a long build that fires no hooks --
  // is otherwise indistinguishable from one that ended.
  app.post<{ Body: { session_ids?: unknown; username?: unknown } }>('/api/registry/heartbeat', async (request, reply) => {
    const { session_ids, username } = request.body || {};

    // Unlike /api/hooks this endpoint requires a credential. Every CLI that can
    // report at all also has one, so nothing is locked out -- and an unsigned
    // report would let anyone read an unowned session id out of world state and
    // hold that session on screen forever after its machine is gone.
    const device = auth.authenticateDevice(request.headers.authorization);
    if (device.kind !== 'authenticated') {
      return reply.status(401).send({ error: 'Installation authentication required' });
    }
    if (!usesSecureTransport(request)) {
      return reply.status(400).send({ error: 'HTTPS is required for installation authentication' });
    }

    if (!Array.isArray(session_ids)) {
      return reply.status(400).send({ error: 'Missing session_ids' });
    }
    if (username !== undefined && (typeof username !== 'string' || username.length > 100)) {
      return reply.status(400).send({ error: 'Username must be text with at most 100 characters' });
    }

    const tracked = remoteRegistry.heartbeat(session_ids, device.ownerId);
    console.log(`[heartbeat] user=${username || 'unknown'} sessions=${tracked}`);
    return reply.status(200).send({ ok: true, tracked });
  });

  app.post<{ Body: { username: string; emote: string } }>('/api/emote', async (request, reply) => {
    const { emote } = request.body || {};
    const device = auth.authenticateDevice(request.headers.authorization);
    if (device.kind === 'authenticated' && !usesSecureTransport(request)) {
      return reply.status(400).send({ error: 'HTTPS is required for installation authentication' });
    }
    if (device.kind !== 'authenticated') {
      return reply.status(401).send({ error: 'Installation authentication required' });
    }

    if (!emote) {
      return reply.status(400).send({ error: 'Missing emote' });
    }

    if (!VALID_EMOTES.includes(emote as EmoteType)) {
      return reply.status(400).send({ error: `Invalid emote. Valid: ${VALID_EMOTES.join(', ')}` });
    }

    const session = state.findSessionByOwnerId(device.ownerId);
    if (!session) {
      return reply.status(404).send({ error: 'No active session for this installation' });
    }

    state.emitEmote(session.sessionId, emote, session.manualControl?.facing);
    return reply.status(200).send({ ok: true, sessionId: session.sessionId });
  });

  app.post<{ Body: { username: string; message: string } }>('/api/chat', async (request, reply) => {
    const { username, message } = request.body || {};
    const device = auth.authenticateDevice(request.headers.authorization);
    if (device.kind === 'authenticated' && !usesSecureTransport(request)) {
      return reply.status(400).send({ error: 'HTTPS is required for installation authentication' });
    }
    if (device.kind !== 'authenticated') {
      return reply.status(401).send({ error: 'Installation authentication required' });
    }

    if (typeof username !== 'string' || !username.trim() || username.length > 100
      || typeof message !== 'string' || !message.trim()) {
      return reply.status(400).send({ error: 'Username and message must be non-empty text (username max 100 characters)' });
    }

    if (message.length > CHAT_MESSAGE_MAX_LENGTH) {
      return reply.status(400).send({ error: `Message too long (max ${CHAT_MESSAGE_MAX_LENGTH} chars)` });
    }

    const chat: ChatMessage = {
      username,
      message,
      timestamp: Date.now(),
    };

    state.appendChat(chat);
    return reply.status(200).send({ ok: true });
  });

  app.post<{ Body: { username?: string; session_id?: string; summary: string } }>('/api/context', async (request, reply) => {
    const { session_id, summary } = request.body || {};
    const device = auth.authenticateDevice(request.headers.authorization);
    if (device.kind === 'authenticated' && !usesSecureTransport(request)) {
      return reply.status(400).send({ error: 'HTTPS is required for installation authentication' });
    }
    if (device.kind !== 'authenticated') {
      return reply.status(401).send({ error: 'Installation authentication required' });
    }

    if (typeof summary !== 'string' || !summary.trim()) {
      return reply.status(400).send({ error: 'Summary must be non-empty text' });
    }

    const requested = session_id ? state.get(session_id) : undefined;
    const session = requested?.ownerId === device.ownerId
      ? requested
      : (!session_id ? state.findSessionByOwnerId(device.ownerId) : undefined);

    if (!session) {
      return reply.status(404).send({ error: 'No active session found for this installation' });
    }

    const updated = state.updateContext(session.sessionId, summary);
    return reply.status(200).send({ ok: true, sessionId: updated?.sessionId ?? session.sessionId });
  });

  app.get('/api/config', async (_request, reply) => {
    // The file also holds private installation settings. Never serialize it wholesale.
    const { title, environment, graphicDeath } = serverConfig;
    return reply.header('Cache-Control', 'no-store').send({ title, environment, graphicDeath, branding: publicBranding(serverConfig.branding) });
  });

  app.get('/api/health', async (_request, reply) => {
    const persistence = getPersistenceStatus();
    return reply.send({
      status: persistence.healthy ? 'ok' : 'degraded',
      agents: state.getAll().length,
      clients: broadcast.clientCount,
      revision: state.getSnapshot().revision,
      persistence: {
        healthy: persistence.healthy,
        lastSavedRevision: persistence.lastSavedRevision,
      },
      uptime: process.uptime(),
    });
  });

  app.get('/api/state', async (_request, reply) => {
    return reply.send(state.getSnapshot());
  });

  app.post('/api/vortex', async (request, reply) => {
    const device = auth.authenticateDevice(request.headers.authorization);
    if (device.kind === 'invalid') return reply.status(401).send({ error: 'Invalid installation credential' });
    const browser = request.cookies && readBrowserPrincipal(request, auth);
    if (device.kind !== 'authenticated' && !browser) {
      return reply.status(401).send({ error: 'Connect your browser or authenticate your installation to start a vortex' });
    }
    if (!usesSecureTransport(request)) return reply.status(400).send({ error: 'HTTPS is required' });
    // Browser cookies require an exact same-origin request; CLI credentials do not send Origin.
    if ((request.headers.origin || device.kind !== 'authenticated')
      && !isSameHostOrigin(request.headers.origin, request.headers.host)) {
      return reply.status(403).send({ error: 'Invalid browser origin' });
    }
    const active = state.getSnapshot().events.find(event => event.effect === 'vortex' && event.expiresAt > Date.now());
    if (active) {
      return reply.header('Retry-After', Math.max(1, Math.ceil((active.expiresAt - Date.now()) / 1000)))
        .status(429).send({ error: 'A vortex is already running. Wait for it to finish.' });
    }
    const event = state.startGlobalEvent('vortex');
    return reply.send({ ok: true, eventId: event.id });
  });
}
