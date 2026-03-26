import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

import { StateManager } from './state.js';
import { BroadcastManager } from './ws/broadcast.js';
import { registerHookRoutes } from './routes/hooks.js';
import { startStaleReaper } from './cleanup.js';
import { SessionRegistryWatcher } from './session-registry.js';
import { TokenAuth, loadOrCreateSecret } from './auth.js';
import { DEFAULT_PORT, DEFAULT_SERVER_CONFIG, VALID_EMOTES, CHAT_MESSAGE_MAX_LENGTH } from '../shared/constants.js';
import type { ServerConfig, EmoteType } from '../shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadServerConfig(): ServerConfig {
  const configPath = resolve(__dirname, '../server-config.json');
  let config = { ...DEFAULT_SERVER_CONFIG };
  try {
    if (existsSync(configPath)) {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
      config = { ...config, ...raw };
    }
  } catch (err) {
    console.warn('Failed to load server-config.json, using defaults:', err);
  }

  // Env var override: GRAPHIC_DEATH=true
  if (process.env.GRAPHIC_DEATH !== undefined) {
    config.graphicDeath = process.env.GRAPHIC_DEATH === 'true' || process.env.GRAPHIC_DEATH === '1';
  }

  // Env var override: ENVIRONMENT=farm|office|arcade
  if (process.env.ENVIRONMENT) {
    config.environment = process.env.ENVIRONMENT as import('../shared/types.js').EnvironmentType;
  }

  return config;
}

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

  // Server config
  const serverConfig = loadServerConfig();

  // Auth
  const tokenSecret = loadOrCreateSecret();
  const auth = new TokenAuth(tokenSecret);

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
  registerHookRoutes(app, state, broadcast, serverConfig, auth);

  // WebSocket endpoint
  app.get('/ws', { websocket: true }, (socket) => {
    broadcast.add(socket);
    // Send current state on connect
    broadcast.sendFullState(socket, state.getAll());

    socket.on('message', (raw: string | Buffer) => {
      try {
        const msg = JSON.parse(String(raw));
        switch (msg.type) {
          case 'request_state':
            broadcast.sendFullState(socket, state.getAll());
            break;

          case 'auth': {
            const username = auth.validateToken(msg.token);
            if (username) {
              broadcast.authenticateSocket(socket, username);
              broadcast.sendTo(socket, { type: 'auth_result', success: true, username });
            } else {
              broadcast.sendTo(socket, { type: 'auth_result', success: false, error: 'Invalid token' });
            }
            break;
          }

          case 'emote': {
            const wsUser = broadcast.getSocketUsername(socket);
            if (!wsUser) break;
            const session = state.findSessionByUsername(wsUser);
            if (session && VALID_EMOTES.includes(msg.emote as EmoteType)) {
              state.emitEmote(session.sessionId, msg.emote);
            }
            break;
          }

          case 'chat': {
            const chatUser = broadcast.getSocketUsername(socket);
            if (!chatUser) break;
            const message = String(msg.message || '').slice(0, CHAT_MESSAGE_MAX_LENGTH);
            if (message) {
              broadcast.broadcastChatMessage({ username: chatUser, message, timestamp: Date.now() });
            }
            break;
          }
        }
      } catch {
        // Ignore malformed messages
      }
    });
  });

  // Watch Claude session registry for name changes
  const registry = new SessionRegistryWatcher((sessionId, name) => {
    state.updateSessionName(sessionId, name);
  });
  registry.start();
  state.setSessionNameLookup((id) => registry.getSessionName(id));

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
