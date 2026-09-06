import { TeamRoster } from './team-roster.js';
import { VisitorBasketball } from './visitor-basketball.js';
import { registerTeamRoutes } from './routes/team.js';
import { watchPresenceConnection } from './ws/presence-heartbeat.js';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

import { StateManager } from './state.js';
import { BroadcastManager } from './ws/broadcast.js';
import { registerHookRoutes } from './routes/hooks.js';
import {
  BROWSER_SESSION_COOKIE,
  readBrowserPrincipal,
  registerAuthRoutes,
} from './routes/auth.js';
import { isSameHostOrigin } from './request-security.js';
import { startStaleReaper } from './cleanup.js';
import { SessionRegistryWatcher } from './session-registry.js';
import { AuthService, loadOrCreateSecret } from './auth.js';
import { AuthHandoffManager } from './auth-handoff.js';
import { ControlManager } from './control-manager.js';
import { GrabManager, parseGrabTarget } from './grab-manager.js';
import { DEFAULT_PORT, DEFAULT_SERVER_CONFIG, VALID_EMOTES, CHAT_MESSAGE_MAX_LENGTH } from '../shared/constants.js';
import { loadSessions } from './session-store.js';
import { LibSqlWorldRepository } from './persistence/libsql-world-repository.js';
import { WorldPersistence } from './persistence/world-persistence.js';
import { normalizeBundledClientEnvironment } from './client-environment.js';
import { AvatarProfiles } from './avatar-profiles.js';
import { registerAvatarRoutes } from './routes/avatar.js';
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

  // Read a preferred environment, then constrain it to the bundled renderer.
  if (process.env.ENVIRONMENT) {
    config.environment = process.env.ENVIRONMENT as import('../shared/types.js').EnvironmentType;
  }

  return normalizeBundledClientEnvironment(config, DEFAULT_SERVER_CONFIG.environment ?? 'arcade');
}

async function main() {
  const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  const host = process.env.HOST || '0.0.0.0';

  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(cookie);
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
  const auth = new AuthService(tokenSecret);
  const authHandoffs = new AuthHandoffManager();

  // Authoritative world state and durable persistence
  const state = new StateManager(serverConfig.environment ?? 'arcade');
  const repository = new LibSqlWorldRepository();
  await repository.initialize();
  const storedWorld = await repository.load();
  if (storedWorld) {
    state.restoreWorld(storedWorld);
    console.log(`[startup] Restored world revision ${storedWorld.revision} from durable storage`);
  } else {
    const legacySessions = loadSessions();
    if (legacySessions.length > 0) {
      state.restoreSessions(legacySessions);
      console.log(`[startup] Imported ${legacySessions.length} session(s) from the legacy JSON store`);
    }
  }
  const avatarProfiles = new AvatarProfiles(repository, state);
  await avatarProfiles.initialize();
  const team = new TeamRoster(repository, () => state.getAll(), ownerId => {
    const profile = avatarProfiles.get(ownerId); return profile.saved ? profile.avatar : undefined;
  });
  await team.initialize();
  const persistence = new WorldPersistence(repository);
  const broadcast = new BroadcastManager();
  const controls = new ControlManager(state, broadcast);
  const grabs = new GrabManager(state, broadcast);
  const visitorBalls = new VisitorBasketball(broadcast);

  // HTTP routes
  registerHookRoutes(app, state, broadcast, serverConfig, auth, () => persistence.status());
  registerAuthRoutes(app, auth, authHandoffs);
  registerAvatarRoutes(app, auth, avatarProfiles);
  registerTeamRoutes(app, team);

  // WebSocket endpoint
  app.get('/ws', { websocket: true }, (socket, request) => {
    const sessionCookie = request.cookies[BROWSER_SESSION_COOKIE];
    if (sessionCookie && !isSameHostOrigin(request.headers.origin, request.headers.host)) {
      socket.close(1008, 'Invalid browser origin');
      return;
    }

    broadcast.add(socket);
    watchPresenceConnection(socket);
    const principal = readBrowserPrincipal(request, auth);
    if (principal) { broadcast.authenticateSocket(socket, principal); team.connect(socket, principal); }

    // Send one complete, revisioned world and any active grab leases on connect.
    broadcast.sendWorldSnapshot(socket, state.getSnapshot());
    grabs.sendActive(socket);
    visitorBalls.sendActive(socket);
    if (principal) {
      broadcast.sendTo(socket, {
        type: 'auth_result',
        success: true,
        username: principal.username,
        ownerId: principal.ownerId,
      });
    }

    const dropSocket = (reason: string) => {
      team.disconnect(socket);
      controls.releaseSocket(socket, reason);
      grabs.releaseSocket(socket, reason);
      visitorBalls.disconnect(socket);
    };
    socket.on('close', () => dropSocket('Browser disconnected'));
    socket.on('error', () => dropSocket('Browser disconnected'));

    socket.on('message', (raw: string | Buffer) => {
      try {
        const msg = JSON.parse(String(raw));
        switch (msg.type) {
          case 'visitor_ball':
            visitorBalls.receive(socket, msg);
            break;
          case 'request_state':
            broadcast.sendWorldSnapshot(socket, state.getSnapshot());
            break;


          case 'logout':
            dropSocket('Logged out');
            broadcast.deauthenticateSocket(socket);
            break;

          case 'control_claim':
            controls.claim(
              socket,
              broadcast.getSocketPrincipal(socket)?.ownerId,
              String(msg.sessionId || ''),
            );
            break;

          case 'control_input':
            controls.updateInput(
              socket,
              broadcast.getSocketPrincipal(socket)?.ownerId,
              String(msg.sessionId || ''),
              msg.input,
            );
            break;

          case 'control_release':
            controls.release(
              socket,
              broadcast.getSocketPrincipal(socket)?.ownerId,
              String(msg.sessionId || ''),
            );
            break;

          case 'shoot':
            controls.shoot(
              socket,
              broadcast.getSocketPrincipal(socket)?.ownerId,
              String(msg.sessionId || ''),
            );
            break;

          case 'grab_start':
            grabs.begin(socket, broadcast.getSocketPrincipal(socket)?.username, parseGrabTarget(msg), Number(msg.x), Number(msg.y));
            break;

          case 'grab_move':
            grabs.move(socket, broadcast.getSocketPrincipal(socket)?.username, parseGrabTarget(msg), Number(msg.x), Number(msg.y));
            break;

          case 'grab_end':
            grabs.end(
              socket,
              broadcast.getSocketPrincipal(socket)?.username,
              parseGrabTarget(msg),
              Number(msg.x),
              Number(msg.y),
              Number.isInteger(msg.workstationSlot) ? Number(msg.workstationSlot) : undefined,
            );
            break;

          case 'emote': {
            const wsPrincipal = broadcast.getSocketPrincipal(socket);
            if (!wsPrincipal || !VALID_EMOTES.includes(msg.emote as EmoteType)) break;
            const requested = msg.sessionId ? state.get(String(msg.sessionId)) : undefined;
            const session = requested && requested.ownerId === wsPrincipal.ownerId
              ? requested
              : (!msg.sessionId ? state.findSessionByOwnerId(wsPrincipal.ownerId) : undefined);
            if (session) {
              state.emitEmote(session.sessionId, msg.emote, session.manualControl?.facing);
            }
            break;
          }

          case 'chat': {
            const chatPrincipal = broadcast.getSocketPrincipal(socket);
            if (!chatPrincipal) break;
            const message = String(msg.message || '').slice(0, CHAT_MESSAGE_MAX_LENGTH);
            if (message) {
              state.appendChat({ username: chatPrincipal.username, message, timestamp: Date.now() });
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
  state.getSnapshot().agents.forEach(agent => team.observe(agent));

  // Broadcast revisioned deltas and checkpoint the complete world.
  state.onStateChange((notification) => {
    if (notification.type === 'effect') {
      broadcast.broadcastEffect(
        notification.sessionId,
        notification.effect,
        notification.effectData,
      );
      return;
    }

    // Publish and checkpoint this revision before lifecycle callbacks can synchronously
    // create a later revision (for example, clearing a stopped control lease).
    team.sync(notification.delta);
    persistence.schedule(state.getSnapshot(), notification.immediatePersistence);
    broadcast.broadcastWorldDelta(notification.delta);
    for (const change of notification.delta.changes) {
      if (change.kind === 'agent_remove') {
        controls.releaseSession(change.sessionId, 'Agent session ended');
        grabs.releaseSession(change.sessionId, 'Agent session ended');
      } else if (change.kind === 'agent_upsert'
        && change.agent.activity === 'stopped'
        && change.agent.manualControl) {
        controls.releaseSession(change.agent.sessionId, 'Agent session ended');
        grabs.syncSession(change.agent);
      } else if (change.kind === 'agent_upsert') {
        grabs.syncSession(change.agent);
      }
    }
  });

  // Persist startup reconciliation and one-time legacy imports even when no hooks fire afterward.
  persistence.schedule(state.getSnapshot(), true);

  // Start stale cleanup, lifecycle pruning, and manual-control simulation.
  const staleTimer = startStaleReaper(state);
  const teamTimer = setInterval(() => void team.flush(), 5_000);
  const worldTimer = setInterval(() => { state.advanceWorld(); visitorBalls.expire(); }, 1_000);
  controls.start();
  grabs.start();

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await app.close();
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
  app.addHook('onClose', async () => {
    clearInterval(staleTimer);
    clearInterval(worldTimer);
    clearInterval(teamTimer);
    registry.stop();
    controls.stop();
    grabs.stop();
    await team.flush();
    await persistence.close();
  });

  await app.listen({ port, host });
  console.log(`\n  Agent Factory server running on http://${host}:${port}`);
  console.log(`  WebSocket endpoint: ws://${host}:${port}/ws`);
  console.log(`  Health check: http://${host}:${port}/api/health\n`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
