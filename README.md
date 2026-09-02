# Agent Factory

A 2D pixel art visualization of Claude Code/Codex agent sessions. Watch your team's agents work in a retro arcade game room in real time.

![Retro arcade themed visualization](https://img.shields.io/badge/theme-retro%20arcade-ff00ff)
![Hook events](https://img.shields.io/badge/powered%20by-hook%20events-00ffff)

## What it does

- Each active Claude Code or Codex session appears as an animated pixel art avatar
- Working agents stand at arcade cabinets with neon glow effects
- Idle agents hang out in the lounge area
- Subagents orbit their parent with a purple tint
- Hover over any avatar to see session details (username, project, current tool, task description)
- Team members connect to a shared server to see everyone's agents at once
- Log in from the browser to send emotes and chat via a terminal-style command prompt

## Quick Install (Team Members)

If someone on your team is already running the server, just install the hooks:

```bash
curl -fsSL https://raw.githubusercontent.com/wolzey/agent-factory/main/install-cli.sh | bash
```

This downloads a small binary and runs an interactive wizard that:
1. Asks for your display name
2. Asks for the server URL (they'll give you this)
3. Lets you pick an avatar color and style
4. Installs the hooks into your Claude Code and/or Codex settings

**Requirements:** `curl`, Claude Code and/or Codex installed

For non-interactive installs (CI, scripting):

```bash
agent-factory install --non-interactive --server-url https://your-server.example.com --username alice
```

## Running the Server

### Prerequisites

- Node.js 18+
- pnpm

### Setup

```bash
git clone https://github.com/wolzey/agent-factory.git
cd agent-factory
pnpm install
pnpm dev
```

This starts:
- **Server** on `http://localhost:4242` (HTTP + WebSocket)
- **Client** on `http://localhost:5173` (Vite dev server)

Open `http://localhost:5173` in your browser to see the arcade.

### Exposing to your team

Use ngrok, Tailscale, or any tunnel to expose port 4242:

```bash
# ngrok
ngrok http 4242

# Then tell your team to install with:
# curl -fsSL https://raw.githubusercontent.com/wolzey/agent-factory/main/install-cli.sh | bash
# and enter the ngrok URL when prompted
```

### Production

Production requires a durable [Turso](https://turso.tech/) libSQL database:

```bash
export TURSO_DATABASE_URL='libsql://your-database.turso.io'
export TURSO_AUTH_TOKEN='your-token'
pnpm build
pnpm start  # serves on port 4242 (both API and static client)
```

Never commit or print the auth token. Set `PORT` and `HOST` to customize the listener. Set `ENVIRONMENT` to choose `arcade`, `farm`, `office`, or `mining`.

Local development uses `file:.data/agent-factory.db` automatically when `TURSO_DATABASE_URL` is absent. The directory is ignored by Git.

> [!IMPORTANT]
> **Existing production deployments must configure both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` before upgrading to this release.** When `NODE_ENV=production`, the server intentionally exits during startup if either value is missing so it cannot silently run with non-durable state.

### Deploying to Render

The included [`render.yaml`](render.yaml) creates a free Docker web service named `agent-factory`. Its filesystem is ephemeral, so the authoritative world is stored in Turso instead of a local SQLite file.

Create the database with the Turso dashboard or CLI:

```bash
turso db create agent-factory
turso db show agent-factory --url
turso db tokens create agent-factory
```

Use the URL and token returned by the final two commands for the Render Blueprint secret prompts. Do not paste the token into source files, logs, issues, or pull requests.

| Variable | Required on Render | Purpose |
|----------|--------------------|---------|
| `AF_TOKEN_SECRET` | Yes | Secret used to sign login tokens. The blueprint generates this value; do not expose or reuse it elsewhere. |
| `TURSO_DATABASE_URL` | Yes | Durable libSQL database URL. Entered securely during Blueprint setup. |
| `TURSO_AUTH_TOKEN` | Yes | Database auth token. Entered securely during Blueprint setup. |
| `HOST` | Yes | Must be `0.0.0.0` so Render can reach the server. Preconfigured by the blueprint. |
| `PORT` | No | Render supplies this automatically; the Docker image defaults to `4242` elsewhere. |
| `TITLE` | No | Display name shown in the app. Defaults to `AGENT FACTORY`. |
| `ENVIRONMENT` | No | Background theme: `arcade`, `farm`, `office`, or `mining`. Defaults to `arcade`. |
| `GRAPHIC_DEATH` | No | Set to `true` or `1` to enable graphic death effects. |

The server creates the `world_state` table automatically. Deploy the server and client together because the revisioned WebSocket protocol is versioned as one application artifact. After deployment, verify persistence without exposing configuration:

```bash
curl -fsS https://your-service.example.com/api/health \
  | jq '{status, revision, persistence}'
```

The response should report `status: "ok"` and `persistence.healthy: true`. Restart the Render service, then confirm the revision, agents, chat, and placements are restored through `/api/state` or the browser. Production startup fails rather than serving an empty world when durable storage cannot be loaded.

`NODE_ENV=production` is set by the Docker image and does not need to be configured in Render.

## How It Works

```
Claude/Codex Hooks  ──curl POST──>  Fastify Server  ──WebSocket──>  Browser (Phaser 3)
(ephemeral bash)                   (port 4242)                     (2D pixel art arcade)
```

1. **Hooks** fire on Claude Code/Codex events (session start/end, tool use, subagent spawn/stop)
2. The hook script reads `~/.config/agent-factory/config.json` for your identity
3. It `curl`s an allowlisted subset of the event to the server (fire-and-forget, never blocks Claude)
4. The server updates one authoritative, revisioned world and checkpoints it to libSQL
5. The server broadcasts ordered deltas; reconnecting browsers receive a complete snapshot
6. Browsers interpolate server-timestamped movement and render cosmetic animation locally

### Upgrading from an older install

`agent-factory update` replaces the binary from inside the running process, so an
upgrade is carried out by the *old* code. Upgrading from a version before the
allowlist therefore leaves the previous hook script in place, still forwarding raw
payloads, until the new binary runs once -- any command will do, and it repairs the
script and says so. To close that window immediately:

```bash
agent-factory update && agent-factory install
```

Later upgrades do not need this; the current `update` rewrites the hook itself.

### What Gets Sent

This applies to every sender: the shell hook used by Claude and Codex, and the pi extension, which posts to the same endpoint.

Claude and Codex hand the hook far more than an avatar needs: `UserPromptSubmit` carries your entire prompt, `PreToolUse` carries the entire `tool_input` (whole Bash command lines, the file contents passed to Write/Edit), and `PostToolUse` adds `tool_response`, which is tool output. The hook sends an explicit allowlist instead, so none of that leaves your machine.

| Sent | Not sent |
|------|----------|
| `session_id`, `hook_event_name`, `cwd` | Prompt text |
| `tool_name` (e.g. `Bash`), `username`, `avatar` | `tool_input` — commands, file paths, file contents |
| `reason`, `agent_id`, `agent_type` | `tool_response` — tool output |
| `message` (notifications) | `transcript_path` |
| `session_name`, `git_action` (derived, see below) | anything else on the payload |

Two features used to read the sensitive fields, so the hook derives them locally and sends only the result:

- **`session_name`** — the name from `/rename <name>`, or a worktree's name. The rest of the prompt is discarded without being inspected further.
- **`git_action`** — `commit` or `pr_merge`, so the celebration effects still fire. The command line itself never leaves the machine.

Two intentional differences from the old behaviour: allowlisted strings are truncated (200 characters for derived names, 512 for paths and identifiers), and `/rename` followed by only whitespace is now ignored rather than blanking the session name.

The server applies the same allowlist again at `/api/hooks`, so a payload from an older hook script is reduced at ingest and never reaches world state, libSQL, or a browser. Old hooks keep working: the server derives `session_name` and `git_action` from the raw shape when they are absent.

`cwd` is still sent in full, and it is shown on hover, so anyone viewing the factory can see your directory paths. If a path is itself sensitive, point that repo at a different server with the `repositories` overrides documented under [Configuration](#configuration).

### Hook Events Tracked

| Event | What happens in the arcade |
|-------|---------------------------|
| `SessionStart` | Avatar spawns at the entrance, walks to lounge |
| `PreToolUse` | Avatar walks to an arcade cabinet, starts working |
| `PostToolUse` | Neon sparkle effect |
| `SubagentStart` | Mini-avatar warps in near parent |
| `SubagentStop` | Mini-avatar dissolves |
| `Stop` | Avatar walks back to lounge |
| `SessionEnd` | Avatar walks to exit, fades out |

### Tool Activity Mapping

| Tools | Avatar activity |
|-------|----------------|
| Read, Glob, Grep | Reading (magnifier icon) |
| Write, Edit | Writing (pencil icon) |
| Bash | Running (terminal icon) |
| WebSearch, WebFetch | Searching (globe icon) |
| Agent | Chatting (chat icon) |
| EnterPlanMode | Planning (brain icon) |

## Browser Commands

You can send emotes and chat directly from the browser. First, get your auth token:

```bash
agent-factory token
```

This prints a token like `d29semV5.a1b2c3d4...`. Copy it, then:

1. Open the Agent Factory page in your browser
2. Click **Login** (top-left corner)
3. Paste your token and click **Login**

Once logged in, an **Avatar Uplink** panel appears in the top-left. It lists every active top-level agent session attributed to your authenticated username. Choose a session and click **Take Control**; the server validates ownership before enabling controls.

### Web Avatar Controls

| Key | Action |
|-----|--------|
| `W` `A` `S` `D` | Move the selected avatar around the factory |
| `B` | Open the radial emote wheel |
| `Left` / `Right` | Rotate the wheel selection |
| `Enter` / `Space` | Confirm the selected wheel emote |
| `Space` | Fire in the avatar's current facing direction while the wheel is closed |
| `Escape` | Close the wheel, or release avatar control |

Manual control affects only the visual avatar. The underlying Claude/Codex session keeps running, its activity indicators continue to update, and automatic workstation/lounge routing resumes when control is released. Control is also released on logout, disconnect, or session end. A newer browser authenticated as the same owner can take over an existing control lease.

A terminal-style command bar also appears at the bottom. Available commands:

| Command | Description |
|---------|-------------|
| `/emote <name>` | Trigger an emote (dance, jump, guitar, gun, laugh, wave, sleep, explode, dizzy, flex, rage, fart) |
| `/chat <message>` | Send a chat message visible to all viewers |
| `/help` | Show available commands |
| `/logout` | Log out of the browser session |
| bare text | Sent as a chat message (no `/` prefix needed) |

Your login persists across page refreshes via localStorage and automatically re-authenticates on reconnect.

> **Note:** The `agent-factory token` command must be run on the machine running the server (tokens are generated via a localhost-only endpoint). Share tokens with team members who need browser access.

## CLI Commands

| Command | Description |
|---------|-------------|
| `agent-factory install` | Interactive setup wizard (hooks, config, avatar) |
| `agent-factory uninstall` | Remove hooks and config |
| `agent-factory update` | Update CLI to latest release |
| `agent-factory token` | Display your auth token for browser login |
| `agent-factory emote <name>` | Trigger an emote on your agent |
| `agent-factory chat <message>` | Send a chat message |
| `agent-factory avatar` | Customize your avatar |

## Configuration

Your config lives at `~/.config/agent-factory/config.json`:

```json
{
  "username": "ethan",
  "serverUrl": "http://localhost:4242",
  "token": "ZXRoYW4.a1b2c3d4e5f6...",
  "avatar": {
    "spriteIndex": 0,
    "color": "#4a90d9",
    "hat": null,
    "trail": null
  }
}
```

| Field | Description |
|-------|-------------|
| `username` | Display name shown on your avatar's nametag |
| `serverUrl` | Agent Factory server URL (localhost or shared) |
| `token` | Auth token for browser login (auto-generated) |
| `avatar.spriteIndex` | Character style (0-7) |
| `avatar.color` | Hex color for your avatar tint |
| `avatar.hat` | Hat accessory (future feature) |
| `avatar.trail` | Trail effect (future feature) |
| `repositories` | Optional directory-prefix overrides keyed by absolute or `~/` paths |

### Repository-aware overrides

Use `repositories` to change config for sessions opened inside a directory tree. Every matching prefix is applied from broadest to most specific, so a nested entry can refine a broader organization-level config while inheriting fields it omits:

```json
{
  "username": "default-user",
  "serverUrl": "http://localhost:4242",
  "avatar": {
    "spriteIndex": 0,
    "color": "#4a90d9",
    "hat": null,
    "trail": null
  },
  "repositories": {
    "~/work/github.com/wolzey": {
      "username": "wolzey-user",
      "serverUrl": "https://team.example.com"
    },
    "~/work/github.com/wolzey/agent-factory": {
      "username": "agent-factory-user"
    }
  }
}
```

For a session under `~/work/github.com/wolzey/agent-factory`, the effective username is `agent-factory-user` and the inherited server is `https://team.example.com`. A sibling such as `~/work/github.com/wolzey-other` does not match. Use the existing `serverUrl` field name inside overrides.

Hooks resolve against the event's `cwd` (falling back to the hook process directory), while CLI commands resolve against the current working directory. Generated auth tokens are saved to the most specific active prefix so repo identities do not overwrite the global token.

## Uninstall

```bash
agent-factory uninstall
```

This removes all Agent Factory hook entries from `~/.claude/settings.json` and `~/.codex/hooks.json` (surgically, preserving your other hooks) and deletes `~/.config/agent-factory/`.

## Architecture

```
agent-factory/
├── server/           # Fastify HTTP + WebSocket server
│   ├── index.ts      # Entrypoint (port 4242)
│   ├── state.ts      # In-memory session state machine
│   ├── auth.ts       # HMAC-SHA256 token auth
│   ├── state.ts      # Authoritative revisioned world aggregate
│   ├── persistence/ # Turso/libSQL snapshot repository and write queue
│   ├── routes/       # POST /api/hooks, GET /api/health, GET /api/auth/token
│   ├── ws/           # WebSocket broadcast manager (per-socket auth)
│   └── cleanup.ts    # Stale session reaper
├── client/           # Phaser 3 browser app
│   ├── scenes/       # BootScene, FactoryScene, UIScene
│   ├── entities/     # AgentSprite, SubagentSprite, Machine
│   ├── systems/      # AgentManager, LayoutManager
│   ├── auth/         # AuthManager (localStorage token persistence)
│   ├── ui/           # ChatOverlay, LoginOverlay, CommandInput
│   └── network/      # WebSocket client with auto-reconnect
├── shared/           # Types and constants shared between server/client
├── cli/              # Go CLI binary
│   ├── cmd/          # Cobra commands (install, uninstall, token, emote, chat, avatar, update)
│   ├── internal/     # Config, hooks, wizard, UI helpers
│   └── main.go       # Entry point
├── hooks/            # Claude/Codex hook scripts (legacy)
└── install-cli.sh    # Bootstrap script (downloads CLI binary)
```

## API

### REST Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/hooks` | Receives hook events from Claude Code/Codex |
| `POST /api/emote` | Trigger an emote (`{ username, emote }`) |
| `POST /api/chat` | Send a chat message (`{ username, message }`) |
| `POST /api/context` | Update agent task description (`{ username, summary }`) |
| `GET /api/auth/token?username=X` | Generate auth token (localhost-only) |
| `GET /api/health` | Server, revision, and persistence status |
| `GET /api/state` | Complete authoritative world snapshot |
| `GET /api/config` | Server config (title, environment, graphicDeath) |

### WebSocket (`ws://host:4242/ws`)

**Server -> Client:** `world_snapshot`, `world_delta`, `effect`, `auth_result`, `control_result`, `control_revoked`. Deltas carry consecutive revisions; clients request a fresh snapshot if a gap is detected.

**Client -> Server:** `request_state`, `auth` (token login), `logout`, `control_claim`, `control_input`, `control_release`, `shoot`, `emote`, `chat`

## License

MIT
