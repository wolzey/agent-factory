# Agent Factory

A shared, pixel-styled 3D room ("Fluid Factory") where each teammate's Claude Code, Codex and pi sessions appear as characters. A hook on each machine posts session events to a Fastify server. The server keeps the authoritative world, and streams revisioned deltas over WebSocket to a three.js client. A Go CLI installs the hooks and handles device linking and the avatar designer.

## Tech Stack

- **Server**: Fastify 5 (TypeScript, Node ESM), `@fastify/websocket`, libSQL/Turso persistence
- **Client**: three.js WebGL scene (Vite 8, TypeScript), plus DOM overlays for buttons, labels and panels
- **CLI**: Go 1.25 (Cobra, Bubbletea, Lipgloss, Huh)
- **Shared**: TypeScript types, constants and simulation code used by server and client (`shared/`, imported as `@shared/*` in the client)
- **Deploy**: Docker multi-stage build on Render (`render.yaml`), which auto-deploys `main` of wolzey/agent-factory

## Local Development

```bash
pnpm install
pnpm dev          # server (tsx watch, port 4242) + client (Vite, port 5173)
```

- Open **http://localhost:5173/?factoryServer=local**. Without that parameter, `factoryHost()` (`client/prototypes/factory25dBoardData.ts`) points localhost pages at the production server. You then see the live room read-only, and your local server goes unused.
- The server listens on `process.env.PORT` (default 4242), and Vite proxies `/api` and `/ws` to 4242. If your launcher exports `PORT`, run `PORT=4242 pnpm dev`.
- Local state lives in `.data/agent-factory.db` (libSQL file). The server only uses Turso when `TURSO_DATABASE_URL` is set; production requires it together with `TURSO_AUTH_TOKEN`.
- The local server also shows your own Claude Code sessions, read from `~/.claude/sessions`.

## Verifying Changes

| Command | What it checks |
|---------|----------------|
| `pnpm test` | Vitest suite in `tests/` (about 20s) |
| `pnpm exec tsc --noEmit -p tsconfig.client.json` | Client types |
| `pnpm exec tsc --noEmit -p tsconfig.server.json` | Server types |
| `pnpm build` | Type checks, Vite build (also writes `.br`/`.gz` files), server compile |
| `cd cli && go test ./...` | Go CLI (its hook tests read `../hooks`, so run from the repo) |

`tests/` does not have its own tsconfig; test files are only checked by Vitest at runtime.

## Where Things Live

```
server/
  index.ts              composition root: Fastify, static files, the WebSocket message switch, timers
  state.ts              StateManager: sessions, hook events -> activity, movement and personal space, tickets, revisions
  routes/               hooks.ts (/api/hooks, /api/state, /api/health), auth, device-links, avatar, team, weather
  ws/broadcast.ts       socket registry and fan-out (serializes once per broadcast)
  persistence/          libSQL world repository and WorldPersistence (checkpoint scheduling)
  *-manager.ts, garage-driving.ts, room-props.ts, pickup-motion.ts, lounge-radio.ts, basketball-*.ts, station-tickets.ts
                        one feature each, wired in index.ts
client/
  index.html            entry; prototype-25d-slice.html is an identical bookmark alias
  prototypes/factory25dSlice.ts   scene setup and the animate() loop (the live client, despite the folder name)
  prototypes/factory25dBoardData.ts   WebSocket connection, snapshots and deltas, factoryHost()
  prototypes/factory25d*.ts       one feature per module (garage, lounge radio, whiteboard, minigames, ...)
  state/WorldStore.ts   applies world deltas
  assets/               Vite public dir: models, fonts, audio, brand art (not fingerprinted)
shared/                 types.ts, constants.ts, factory25d-layout.ts (floor plan and routing), simulations
hooks/agent-factory-hook.sh   the Claude Code hook (see below)
extensions/agent-factory/     pi extension
cli/                    Go CLI (cmd/, internal/); internal/hooks embeds a copy of the hook
experiments/            archived prototypes; nothing imports them, and they are not deployed
```

The server always runs the `factory25d` environment (`server/client-environment.ts`). The `arcade`/`farm`/`office`/`mining` paths in `state.ts` and `shared/world-layouts.ts` are legacy.

## Rules That Are Easy to Break

- **The hook exists in four copies that must stay byte-identical:** `hooks/agent-factory-hook.sh`, `cli/internal/hooks/agent-factory-hook.sh`, and the heredocs in `install.sh` and `hooks/team-install.sh`. `tests/hook-redaction.test.ts` compares them. Edit the canonical file, then copy it into the other three.
- **The hook sends an allowlist, never the raw payload.** Prompts, tool input and tool output must not leave the machine. It derives `session_name` and `git_action` locally, and refuses unsafe server URLs before sending the device secret.
- **Claude Code hook events:** a hook on `WorktreeCreate` or `WorktreeRemove` replaces Claude Code's own git behaviour, so the installers don't register them. `FileChanged` needs a matcher.
- **World changes go through `commit()` in `state.ts`.** It bumps the revision, broadcasts the delta, and schedules a checkpoint. Pass `immediatePersistence` for lifecycle changes (joins, removals, chat, avatars). Movement and activity wait for the 15s checkpoint.
- **Per-frame DOM work in the client:** use `setHidden`/`setPixels` from `client/prototypes/dom.ts`, and decide visibility before writing it. Writing `hidden` twice a frame forces extra style and layout work.
- **Vite fingerprints files emitted under `/assets/`, and the server caches them for a year.** Files in `client/assets` (the public dir) keep their names and are revalidated.

## Conventions

- **Commits**: Conventional Commits, for example `fix(scope): description` or `perf(scope): description`
- **TypeScript**: `strict: true`, ESM with `.js` extensions in server imports, `@shared/*` alias in the client
- **Shared types**: domain and wire types live in `shared/types.ts`
- **Go CLI**: Cobra `RunE` pattern; create a command in `cli/cmd/` and register it in `root.go`
- **Pull requests**: from a fork branch into wolzey/agent-factory `main`, which deploys on merge

## Skills

| Skill | Covers |
|-------|--------|
| [typescript](.claude/skills/typescript/SKILL.md) | Type system, discriminated unions, tsconfig setup, shared types |
| [fastify](.claude/skills/fastify/SKILL.md) | Server routes, WebSocket, plugin registration, auth, state management |
| [go-cli](.claude/skills/go-cli/SKILL.md) | Cobra commands, Bubbletea TUI, Huh forms, hook installation, GoReleaser |
