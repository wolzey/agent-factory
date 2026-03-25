import type { FastifyInstance } from 'fastify';
import type { HookPayload } from '../../shared/types.js';
import type { StateManager } from '../state.js';
import type { BroadcastManager } from '../ws/broadcast.js';

export function registerHookRoutes(
  app: FastifyInstance,
  state: StateManager,
  broadcast: BroadcastManager,
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
