---
name: typescript
description: |
  Agent Factory TypeScript patterns and conventions.
  Use when: editing .ts files in client/, server/, or shared/, working with type definitions,
  configuring tsconfig.json, fixing type errors, creating interfaces or discriminated unions.
user-invocable: false
---

# TypeScript — Agent Factory

TypeScript 6.0.2 with `strict: true` across a split client/server architecture. Shared types live
in `shared/types.ts` and are imported via `@shared/*` path alias. Server uses `.js` extensions for
Node.js ESM; client omits extensions (Vite resolves them).

## Patterns

### Discriminated Union Messages

All WebSocket messages use discriminated unions with a `type` literal field. Both client and server
switch on `msg.type` for exhaustive handling.

```typescript
// From: shared/types.ts:88-95
export type WSMessageToClient =
  | { type: 'state'; sessions: AgentSession[] }
  | { type: 'effect'; sessionId: string; effect: VisualEffect }
  | { type: 'chat'; username: string; message: string }
  // ... 4 more variants
```

### Type-only Imports

All type imports use `import type` to avoid runtime overhead and maintain clear boundaries.

```typescript
// From: server/state.ts:1
import type { AgentSession, HookPayload } from '../shared/types.js';
```

### Union Types over Enums

Domain constants use string union types instead of enums for zero-runtime-cost exhaustive checking.

```typescript
// From: shared/types.ts:2-13
export type AgentActivity = 'idle' | 'thinking' | 'reading' | 'writing' | ...;
export type EmoteType = 'dance' | 'wave' | 'celebrate' | ...;
export type EnvironmentType = 'office' | 'arcade' | 'farm' | 'mining';
```

### Callback Registration with Typed Signatures

State managers expose `on*` methods accepting typed callbacks, stored in arrays.

```typescript
// From: server/state.ts:9-12
type StateChangeCallback = (sessions: AgentSession[]) => void;
// Registration:
onStateChange(cb: StateChangeCallback) { this.changeHandlers.push(cb); }
```

## Conventions

- **File naming**: PascalCase for classes (`AgentSprite.ts`, `BootScene.ts`), kebab-case for config
- **Directory structure**: `server/` (Fastify), `client/` (Phaser), `shared/` (types + constants)
- **Imports**: `@shared/*` alias for shared code; `.js` extensions in server imports (ESM); no extensions in client
- **Exports**: Named exports throughout; no default exports except Vite config
- **Naming**: `private` keyword (no underscore prefix); `on*` for callback handlers; `*Manager` for stateful coordinators
- **Error handling**: Return `null` or fallback values; no custom Error classes; `console.warn` for non-fatal issues

## Common Workflow: Adding a New Message Type

1. Add the variant to the discriminated union in `shared/types.ts`
2. Handle it in the server switch in `server/index.ts` (WebSocket handler) or `server/state.ts`
3. Handle it in the client switch in `client/network/socket.ts`
4. Run `pnpm run build` to verify no exhaustiveness errors

## Anti-Patterns

### WARNING: Unsafe Type Assertions from Environment

Environment variables are cast directly to union types without validation.

```typescript
// BAD — from server/state.ts:49
config.environment = process.env.ENVIRONMENT as EnvironmentType;

// GOOD — validate first:
const env = process.env.ENVIRONMENT;
const valid: EnvironmentType[] = ['office', 'arcade', 'farm', 'mining'];
config.environment = valid.includes(env as any) ? env as EnvironmentType : 'office';
```

### WARNING: Silent Empty Catch Blocks

Several catch blocks swallow errors without logging.

```typescript
// BAD — from server/index.ts:138-140
catch { }

// GOOD — at minimum log:
catch (e) { console.warn('Invalid WS message:', e); }
```

## References

- [Detailed patterns and examples](references/patterns.md)

## Related Skills

- **[fastify](../fastify/SKILL.md)** — Server framework consuming shared types
- **[phaser](../phaser/SKILL.md)** — Client game engine using shared types for state
- **[go-cli](../go-cli/SKILL.md)** — CLI that posts hook events matching shared type definitions
