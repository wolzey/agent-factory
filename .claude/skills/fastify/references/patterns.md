# Fastify Patterns — Detailed Reference

## Server Bootstrap

### Multi-Source Configuration Loading

**Where**: `server/index.ts:21-53`

**What**: Server config is loaded from multiple sources with a priority chain: environment variables > `server-config.json` > `config/default-config.json` > hardcoded defaults.

**Why**: Supports local development (defaults), Docker deployment (env vars), and hosted deployment (config file). The fallback chain ensures the server always starts.

```typescript
// From: server/index.ts:21-53
function loadServerConfig(): ServerConfig {
  const config = { ...DEFAULT_SERVER_CONFIG };
  // Try reading server-config.json
  try {
    const raw = readFileSync(configPath, 'utf-8');
    Object.assign(config, JSON.parse(raw));
  } catch { /* use defaults */ }
  // Env vars override
  if (process.env.PORT) config.port = Number(process.env.PORT);
  if (process.env.HOST) config.host = process.env.HOST;
  return config;
}
```

### Auth Secret Bootstrap

**Where**: `server/auth.ts:22-42`

**What**: The auth secret is resolved from: env var `AF_TOKEN_SECRET` > config file > generate new random secret > persist to config file. This ensures token-based auth works even on first boot.

**Why**: Render.com deployment generates `AF_TOKEN_SECRET` via `render.yaml` env var config. Local dev auto-generates and persists a secret so tokens survive server restarts.

## Route Architecture

### Centralized Route Registration

**Where**: `server/routes/hooks.ts:8-132`

**What**: All HTTP routes are defined in a single `registerRoutes()` function that receives the Fastify instance and all domain managers as parameters.

**Why**: Keeps route definitions separate from server bootstrap. Domain managers are injected rather than imported, making routes testable in isolation.

**Endpoints defined**:
- `POST /api/hooks` — Ingest Claude Code hook events
- `POST /api/emote` — Trigger agent emote animations
- `POST /api/chat` — Send chat messages
- `POST /api/context` — Update agent context info
- `GET /api/auth/token` — Generate auth tokens (localhost only)
- `GET /api/config` — Fetch server configuration
- `GET /api/health` — Health check with uptime
- `GET /api/state` — Current agent session state
- `POST /api/vortex` — Trigger vortex visual effect

### Localhost-Only Token Generation

**Where**: `server/routes/hooks.ts:103-105`

**What**: The `/api/auth/token` endpoint checks `request.ip` against `127.0.0.1` and `::1`. Non-local requests get 403.

**Why**: Tokens grant write access to agent state. Only the local CLI should be able to generate them.

## WebSocket Architecture

### Broadcast Manager

**Where**: `server/ws/broadcast.ts`

**What**: `BroadcastManager` maintains a `Set<WebSocket>` of connected clients. Each socket has metadata (username) attached after auth. Broadcasting iterates the set, skipping sockets not in OPEN state.

**Why**: Decouples message distribution from business logic. The state manager calls `broadcast.send()` without knowing about individual connections.

```typescript
// From: server/ws/broadcast.ts
send(msg: WSMessageToClient) {
  const data = JSON.stringify(msg);
  for (const ws of this.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}
```

### WebSocket Auth Flow

1. Client connects to `/ws`
2. Client sends `{ type: 'auth', token: '...' }` message
3. Server validates HMAC token via `auth.validateToken()`
4. On success, socket metadata tagged with username
5. On failure, socket closed with error frame

## State Management

### Event-Driven State Machine

**Where**: `server/state.ts`

**What**: `StateManager` is the central domain object (603 lines). It processes 24+ hook event types, managing session lifecycle (create, update activity, end) and triggering side effects.

**Why**: Claude Code emits granular hook events (tool use, model response, session start/end). The state manager translates these into visual states for the Phaser client.

### Debounced Session Persistence

**Where**: `server/session-store.ts`

**What**: Sessions are persisted to disk via `writeFileSync` with a 10-second debounce. On startup, prior sessions are loaded from the store file.

**Why**: Enables session recovery after server restart without excessive disk I/O during active use.

## Edge Cases & Gotchas

- **Static file path resolution**: The server checks multiple directories (`dist/client`, `../client/dist`) to support both `pnpm dev` and `pnpm start` execution contexts. Adding a new build output path requires updating this check.
- **WebSocket message size**: No explicit max message size configured. Very large hook payloads could cause memory pressure.
- **CORS `origin: true`**: All origins are allowed. This is intentional for the factory visualization but would need restriction for sensitive endpoints.
- **No graceful shutdown**: The server doesn't register SIGTERM handlers for clean WebSocket disconnection. Docker stop sends SIGTERM, giving 10s before SIGKILL.
- **Session cleanup**: `server/cleanup.ts` handles zombie session detection based on `lastUpdate` timestamps. Cleanup intervals are configurable via server config.
