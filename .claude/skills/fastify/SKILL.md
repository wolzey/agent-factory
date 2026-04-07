---
name: fastify
description: |
  Agent Factory Fastify server patterns and conventions.
  Use when: editing files in server/, working with HTTP routes, WebSocket handlers,
  plugin registration, session state, authentication, or server configuration.
user-invocable: false
---

# Fastify — Agent Factory

Fastify 5.8.4 powers the backend with @fastify/cors, @fastify/static, and @fastify/websocket.
The server ingests hook events from Claude Code CLI sessions, maintains agent state, and broadcasts
updates to Phaser clients over WebSocket.

## Patterns

### Plugin Registration Order

Plugins are registered sequentially: CORS, WebSocket, then static file serving. Static serving
checks multiple candidate directories for dev vs production paths.

```typescript
// From: server/index.ts:59-62
const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(websocket);
```

### Typed Route Handlers

Routes use Fastify's generic type parameter for compile-time body typing.

```typescript
// From: server/routes/hooks.ts:15-20
app.post<{ Body: HookPayload }>('/api/hooks', async (request, reply) => {
  const payload = request.body;
  if (!payload.hook_event_name) {
    return reply.status(400).send({ error: 'Missing hook_event_name' });
  }
  // ...
});
```

### Route Registration via Dependency Injection

Route files export a function receiving the Fastify instance plus domain managers, keeping
routes decoupled from state management.

```typescript
// From: server/routes/hooks.ts:8-14
export function registerRoutes(
  app: FastifyInstance,
  state: StateManager,
  broadcast: BroadcastManager,
  auth: AuthManager,
) { ... }
```

### WebSocket Message Routing

A single `/ws` endpoint handles all real-time communication. Messages are JSON-parsed and
routed via switch on `msg.type`.

```typescript
// From: server/index.ts:94-100
app.get('/ws', { websocket: true }, (socket, request) => {
  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) { ... }
    } catch { }
  });
});
```

## Conventions

- **Route prefixes**: All HTTP routes under `/api/` (hooks, emote, chat, auth, config, health)
- **Error responses**: `reply.status(code).send({ error: 'message' })` with 400/403/404
- **File structure**: `server/index.ts` (bootstrap), `server/routes/` (HTTP), `server/ws/` (WebSocket), `server/state.ts` (domain logic)
- **Imports**: `.js` extensions required for ESM; `node:` prefix for built-ins
- **Config**: Multi-source: env vars > `server-config.json` > defaults from `config/default-config.json`
- **Auth**: HMAC-SHA256 tokens; `/api/auth/token` restricted to localhost

## Common Workflow: Adding a New API Endpoint

1. Add the route handler in `server/routes/hooks.ts` inside `registerRoutes()`
2. Define request/response types in `shared/types.ts` if needed
3. Use `app.post<{ Body: YourType }>('/api/your-route', handler)` pattern
4. Access state via the injected `state` manager parameter
5. Test with `curl -X POST http://localhost:4242/api/your-route -H 'Content-Type: application/json' -d '{}'`

## Anti-Patterns

### WARNING: No Runtime Request Validation

Routes use TypeScript generics for type safety but have no JSON Schema or Zod validation.
Invalid payloads reach the state manager unchecked.

```typescript
// BAD — types are compile-time only:
app.post<{ Body: HookPayload }>('/api/hooks', ...)

// GOOD — add Fastify schema validation:
app.post('/api/hooks', {
  schema: { body: hookPayloadSchema }
}, ...)
```

### WARNING: No Global Error Handler

No `app.setErrorHandler()` is registered. Unhandled errors use Fastify's default serialization
which may leak stack traces in production.

## References

- [Detailed patterns and examples](references/patterns.md)

## Related Skills

- **[typescript](../typescript/SKILL.md)** — Shared types consumed by all routes
- **[phaser](../phaser/SKILL.md)** — Client receiving WebSocket broadcasts
- **[go-cli](../go-cli/SKILL.md)** — CLI posting hook events to `/api/hooks`
