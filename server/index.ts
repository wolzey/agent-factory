import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import { StateManager } from './state.js';
import { BroadcastManager } from './ws/broadcast.js';
import { registerHookRoutes } from './routes/hooks.js';
import { startStaleReaper } from './cleanup.js';
import { DEFAULT_PORT } from '../shared/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  const host = process.env.HOST || '0.0.0.0';

  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  // Serve built client in production
  const clientDist = resolve(__dirname, '../dist/client');
  if (existsSync(clientDist)) {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: '/',
    });
  }

  // State & broadcast
  const state = new StateManager();
  const broadcast = new BroadcastManager();

  // Wire state changes to broadcasts
  state.onStateChange((type, data) => {
    switch (type) {
      case 'update':
        if (data.agent) broadcast.broadcastAgentUpdate(data.agent);
        break;
      case 'remove':
        if (data.sessionId) broadcast.broadcastAgentRemove(data.sessionId);
        break;
      case 'effect':
        if (data.sessionId && data.effect) {
          broadcast.broadcastEffect(data.sessionId, data.effect, data.effectData);
        }
        break;
    }
  });

  // HTTP routes
  registerHookRoutes(app, state, broadcast);

  // WebSocket endpoint
  app.get('/ws', { websocket: true }, (socket) => {
    broadcast.add(socket);
    // Send current state on connect
    broadcast.sendFullState(socket, state.getAll());

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'request_state') {
          broadcast.sendFullState(socket, state.getAll());
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });

  // Start stale session reaper
  startStaleReaper(state);

  await app.listen({ port, host });
  console.log(`\n  Agent Factory server running on http://${host}:${port}`);
  console.log(`  WebSocket endpoint: ws://${host}:${port}/ws`);
  console.log(`  Health check: http://${host}:${port}/api/health\n`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
