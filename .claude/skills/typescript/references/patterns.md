# TypeScript Patterns — Detailed Reference

## Type System Architecture

### Shared Types as Single Source of Truth

**Where**: `shared/types.ts`, `shared/constants.ts`

**What**: All domain types live in `shared/` and are imported by both client and server via the `@shared/*` path alias. No type duplication across boundaries.

**Why**: The client (Phaser) and server (Fastify) communicate over WebSocket using JSON messages. Having a single type definition ensures protocol compatibility at compile time.

```typescript
// From: shared/types.ts:1-30
export type AgentActivity = 'idle' | 'thinking' | 'reading' | 'writing' | 'editing'
  | 'searching' | 'running_command' | 'waiting' | 'error' | 'chatting'
  | 'celebrating' | 'mining';

export interface AgentSession {
  sessionId: string;
  sessionName: string;
  activity: AgentActivity;
  currentTool: string;
  lastUpdate: number;
  // ... more fields
}
```

**Variations**: `shared/constants.ts` exports runtime helpers like `toolToActivity()` that map tool names to `AgentActivity` values, keeping the mapping co-located with the types.

### Discriminated Union Protocol

**Where**: `shared/types.ts:88-130`, `server/index.ts:100-137`, `client/network/socket.ts:61-90`

**What**: WebSocket messages are typed as discriminated unions. The server builds messages with the correct `type` field; the client switches on it.

**Why**: TypeScript's control flow analysis narrows the union inside each case branch, giving full type safety without manual casts.

```typescript
// From: client/network/socket.ts (handler dispatch)
switch (msg.type) {
  case 'state':
    // msg is narrowed to { type: 'state'; sessions: AgentSession[] }
    handler(msg);
    break;
  case 'effect':
    // msg is narrowed to { type: 'effect'; sessionId: string; effect: VisualEffect }
    break;
}
```

## Configuration Split

### Triple tsconfig Setup

**Where**: `tsconfig.json`, `tsconfig.server.json`, `tsconfig.client.json`

**What**: Base config in `tsconfig.json` with `strict: true`, `ES2022` target, `bundler` module resolution. Server config extends base with `rootDir: "."` and `outDir: "dist/server"`. Client config extends base with Vite-compatible settings.

**Why**: Server compiles to JS via `tsc`; client is bundled by Vite. Different output requirements need different configs, but shared strictness settings.

```json
// From: tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "paths": { "@shared/*": ["./shared/*"] }
  }
}
```

### Vite + tsconfig Path Alias Coordination

**Where**: `vite.config.ts:8-10`, `tsconfig.json:16-18`

**What**: The `@shared` alias is defined in both Vite's `resolve.alias` and TypeScript's `paths`. Both must stay in sync.

**Why**: TypeScript needs the path for type checking; Vite needs it for bundling. A mismatch causes either type errors or runtime resolution failures.

## State Management Patterns

### Private Fields with Typed Accessors

**Where**: `server/state.ts:15-20`, `server/session-store.ts`, `client/network/socket.ts:6-12`

**What**: All mutable state uses `private` fields with public accessor methods. Maps are preferred over plain objects for key-value storage.

```typescript
// From: server/state.ts
private sessions = new Map<string, AgentSession>();
get(sessionId: string): AgentSession | undefined {
  return this.sessions.get(sessionId);
}
```

### Callback Arrays for Event Notification

**Where**: `server/state.ts:9-12`, `server/session-registry.ts`

**What**: Managers accept typed callback functions via `on*()` methods. Callbacks are stored in arrays and invoked on state changes.

**Why**: Decouples state mutations from side effects (broadcasting, persistence) without a full event emitter library.

## Edge Cases & Gotchas

- **ESM `.js` extensions**: Server imports MUST include `.js` even though source files are `.ts`. Forgetting this causes runtime `ERR_MODULE_NOT_FOUND` in Node.js.
- **`ignoreDeprecations: "6.0"`**: Required in tsconfig.json for TypeScript 6.x compatibility. Removing it may cause build failures.
- **No test framework**: This repo has no Jest/Vitest setup. Type checking via `tsc --noEmit` is the primary validation tool.
- **`type` module in package.json**: The project uses `"type": "module"` for native ESM. CommonJS `require()` will not work.
