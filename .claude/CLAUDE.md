# Agent Factory

2D pixel-art visualization of Claude Code agent sessions. A Fastify server ingests hook events from Claude Code CLI sessions, maintains agent state, and broadcasts updates to a Phaser 3 game client over WebSocket. A Go CLI handles hook installation, authentication, and an interactive avatar designer.

## Tech Stack

- **Server**: Fastify 5.8.4 (TypeScript, Node.js ESM)
- **Client**: Phaser 3.90.0 (TypeScript, Vite 8.0.2)
- **CLI**: Go 1.25.1 (Cobra, Bubbletea, Lipgloss, Huh)
- **Shared**: TypeScript types + constants consumed by both server and client
- **Deploy**: Docker multi-stage build, Render.com

## Quick Start

```bash
pnpm install
pnpm dev          # Starts server (tsx watch) + client (vite dev) concurrently
```

CLI (requires Go 1.25+):
```bash
cd cli && go build -o agent-factory && ./agent-factory install
```

## Common Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start server + client in dev mode (port 4242 + 5173) |
| `pnpm dev:server` | Start only the Fastify server with tsx watch |
| `pnpm dev:client` | Start only the Vite dev server |
| `pnpm build` | Build client (Vite) + server (tsc) for production |
| `pnpm start` | Run the production build |
| `cd cli && go build -o agent-factory` | Build the Go CLI binary |

## Project Structure

```
agent-factory/
├── server/              # Fastify backend
│   ├── index.ts         # Server bootstrap, WebSocket handler
│   ├── routes/hooks.ts  # All HTTP API routes
│   ├── ws/broadcast.ts  # WebSocket client management
│   ├── state.ts         # Agent state machine (603 lines, core logic)
│   ├── auth.ts          # HMAC-SHA256 token auth
│   ├── session-store.ts # Debounced disk persistence
│   ├── session-registry.ts # Claude session file watcher
│   └── cleanup.ts       # Zombie session cleanup
├── client/              # Phaser 3 game client
│   ├── main.ts          # Phaser game config
│   ├── scenes/          # BootScene, FactoryScene, UIScene
│   ├── entities/        # AgentSprite, SubagentSprite, Machine
│   ├── systems/         # AgentManager, LayoutManager
│   ├── environments/    # Theme generators (Office, Arcade, Farm, Mining)
│   ├── ui/              # DOM overlays (Chat, Login, CommandInput)
│   ├── audio/           # jsfxr sound bank
│   └── network/         # WebSocket client
├── shared/              # Shared between server + client
│   ├── types.ts         # All domain types (discriminated unions)
│   └── constants.ts     # Activity mappings, emote lists
├── cli/                 # Go CLI tool
│   ├── main.go          # Entry point
│   ├── cmd/             # Cobra commands (install, connect, chat, etc.)
│   └── internal/        # Config, UI styles, hooks, avatar designer
├── hooks/               # Shell hook scripts
├── config/              # Default server config
├── vite.config.ts       # Vite build config with @shared alias
├── tsconfig.json        # Base TS config (strict, ES2022, bundler)
├── Dockerfile           # Multi-stage production build
└── render.yaml          # Render.com deployment config
```

## Architecture

The system follows an event-driven architecture. Claude Code sessions emit hook events (tool use, model response, session start/end) that the Go CLI forwards to the Fastify server via HTTP POST. The server's `StateManager` processes these into visual agent states and broadcasts updates over WebSocket to all connected Phaser clients. All textures are procedurally generated — no external image assets.

## Conventions

- **Commits**: Conventional commits — `fix(scope): description`, `feat(scope): description`
- **TypeScript**: `strict: true`, ESM with `.js` extensions in server imports, `@shared/*` path alias
- **Shared types**: All domain types in `shared/types.ts`, imported by both server and client
- **Error handling**: Silent fallbacks with `console.warn`; no custom Error classes
- **Server routes**: All under `/api/` prefix with typed Fastify generics
- **Go CLI**: Cobra `RunE` pattern, Charmbracelet ecosystem for TUI

## When Making Changes

1. If modifying shared types, update `shared/types.ts` and check both server and client compile
2. If adding server routes, add to `server/routes/hooks.ts` using the typed handler pattern
3. If adding visual effects, define in shared types, handle in AgentManager, implement in AgentSprite
4. If adding CLI commands, create a new file in `cli/cmd/`, register in `root.go`
5. Run `pnpm build` to verify the full build succeeds

## Generated Skills

The following skills provide detailed, repo-specific guidance for each technology:

| Skill | Covers |
|-------|--------|
| [typescript](.claude/skills/typescript/SKILL.md) | Type system, discriminated unions, tsconfig setup, shared types |
| [fastify](.claude/skills/fastify/SKILL.md) | Server routes, WebSocket, plugin registration, auth, state management |
| [phaser](.claude/skills/phaser/SKILL.md) | Scene architecture, entities, procedural textures, tweens, themes |
| [go-cli](.claude/skills/go-cli/SKILL.md) | Cobra commands, Bubbletea TUI, Huh forms, hook installation, GoReleaser |

<!-- Updated by /conjure on 2026-04-07 -->
