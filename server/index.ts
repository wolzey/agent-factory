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
import { ControlManager } from './control-manager.js';
import { DEFAULT_PORT, DEFAULT_SERVER_CONFIG, VALID_EMOTES, CHAT_MESSAGE_MAX_LENGTH } from '../shared/constants.js';
import { loadSessions, createDebouncedSave } from './session-store.js';
import type { ServerConfig, EmoteType } from '../shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadServerConfig(): ServerConfig {
  let config = { ...DEFAULT_SERVER_CONFIG };
  try {
    const configCandidates = [
      resolve(__dirname, '../../../server-config.json'),
      resolve(__dirname, '../server-config.json'),
    ];
    const configPath = configCandidates.find((p) => existsSync(p));
    if (configPath) {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
      config = { ...config, ...raw };
    }
  } catch (err) {
    console.warn('Failed to load server-config.json, using defaults:', err);
  }

  // Env var override: TITLE
  if (process.env.TITLE) {
    config.title = process.env.TITLE;
  }

  // Env var override: GRAPHIC_DEATH=true
  if (process.env.GRAPHIC_DEATH !== undefined) {
    config.graphicDeath = process.env.GRAPHIC_DEATH === 'true' || process.env.GRAPHIC_DEATH === '1';
  }

  // Env var override: ENVIRONMENT=arcade|farm|office|mining
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

  // Serve built client in production.
  // Supports both source runtime (`server/index.ts`) and transpiled runtime (`dist/server/server/index.js`).
  const clientDistCandidates = [
    resolve(__dirname, '../dist/client'),
    resolve(__dirname, '../../client'),
    resolve(__dirname, '../client'),
  ];
  const clientDist = clientDistCandidates.find((p) => existsSync(p));
  if (clientDist) {
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
  const controls = new ControlManager(state, broadcast);

  // HTTP routes
  registerHookRoutes(app, state, broadcast, serverConfig, auth);

  // WebSocket endpoint
  app.get('/ws', { websocket: true }, (socket) => {
    broadcast.add(socket);
    // Send current state on connect
    broadcast.sendFullState(socket, state.getAll());

    socket.on('close', () => controls.releaseSocket(socket, 'Browser disconnected'));
    socket.on('error', () => controls.releaseSocket(socket, 'Browser disconnected'));

    socket.on('message', (raw: string | Buffer) => {
      try {
        const msg = JSON.parse(String(raw));
        switch (msg.type) {
          case 'request_state':
            broadcast.sendFullState(socket, state.getAll());
            break;

          case 'auth': {
            const username = auth.validateToken(String(msg.token || ''));
            if (username) {
              controls.releaseSocket(socket, 'Browser re-authenticated');
              broadcast.authenticateSocket(socket, username);
              broadcast.sendTo(socket, { type: 'auth_result', success: true, username });
            } else {
              controls.releaseSocket(socket, 'Authentication failed');
              broadcast.deauthenticateSocket(socket);
              broadcast.sendTo(socket, { type: 'auth_result', success: false, error: 'Invalid token' });
            }
            break;
          }

          case 'logout':
            controls.releaseSocket(socket, 'Logged out');
            broadcast.deauthenticateSocket(socket);
            break;

          case 'control_claim':
            controls.claim(
              socket,
              broadcast.getSocketUsername(socket),
              String(msg.sessionId || ''),
              Number(msg.x),
              Number(msg.y),
            );
            break;

          case 'control_input':
            controls.updateInput(
              socket,
              broadcast.getSocketUsername(socket),
              String(msg.sessionId || ''),
              msg.input,
            );
            break;

          case 'control_release':
            controls.release(
              socket,
              broadcast.getSocketUsername(socket),
              String(msg.sessionId || ''),
            );
            break;

          case 'shoot':
            controls.shoot(
              socket,
              broadcast.getSocketUsername(socket),
              String(msg.sessionId || ''),
            );
            break;

          case 'emote': {
            const wsUser = broadcast.getSocketUsername(socket);
            if (!wsUser || !VALID_EMOTES.includes(msg.emote as EmoteType)) break;
            const requested = msg.sessionId ? state.get(String(msg.sessionId)) : undefined;
            const session = requested && requested.username === wsUser
              ? requested
              : (!msg.sessionId ? state.findSessionByUsername(wsUser) : undefined);
            if (session) {
              state.emitEmote(session.sessionId, msg.emote, session.manualControl?.facing);
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

  // Watch Claude session registry for name changes, liveness, and new sessions
  const registry = new SessionRegistryWatcher((sessionId, name) => {
    state.updateSessionName(sessionId, name);
  });
  registry.setNewSessionCallback((sessionId, cwd, name) => {
    state.recoverSessionFromRegistry(sessionId, cwd, name);
  });
  state.setSessionNameLookup((id) => registry.getSessionName(id));
  state.setSessionAliveCheck((id) => registry.isSessionAlive(id));

  // Await first poll so the cache is populated before we restore sessions
  await registry.start();

  // Restore persisted sessions that are still alive in the registry
  const storedSessions = loadSessions();
  if (storedSessions.length > 0) {
    const alive = storedSessions.filter(s => registry.isSessionAlive(s.sessionId));
    if (alive.length > 0) {
      state.restoreSessions(alive);
      console.log(`[startup] Restored ${alive.length}/${storedSessions.length} persisted session(s) (${storedSessions.length - alive.length} no longer in registry)`);
    }
  }

  // Broadcast and persist state changes while enforcing control lifecycle.
  const debouncedSave = createDebouncedSave();
  state.onStateChange((type, data) => {
    switch (type) {
      case 'update':
        if (data.agent) {
          if (data.agent.activity === 'stopped' && data.agent.manualControl) {
            controls.releaseSession(data.agent.sessionId, 'Agent session ended');
          }
          broadcast.broadcastAgentUpdate(data.agent);
        }
        break;
      case 'remove':
        if (data.sessionId) {
          controls.releaseSession(data.sessionId, 'Agent session ended');
          broadcast.broadcastAgentRemove(data.sessionId);
        }
        break;
      case 'effect':
        if (data.sessionId && data.effect) {
          broadcast.broadcastEffect(data.sessionId, data.effect, data.effectData);
        }
        break;
    }
    debouncedSave(state.getAll());
  });

  // Start stale session reaper and manual-control simulation
  startStaleReaper(state);
  controls.start();

  await app.listen({ port, host });
  console.log(`\n  Agent Factory server running on http://${host}:${port}`);
  console.log(`  WebSocket endpoint: ws://${host}:${port}/ws`);
  console.log(`  Health check: http://${host}:${port}/api/health\n`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
