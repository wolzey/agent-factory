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

```bash
pnpm build
pnpm start  # serves on port 4242 (both API and static client)
```

Set `PORT` and `HOST` environment variables to customize.
Set `ENVIRONMENT` to choose a background: `arcade`, `farm`, `office`, or `mining`.

### Deploying to Render

The included [`render.yaml`](render.yaml) creates a Docker web service named `agent-factory`. Create a new Render Blueprint from this repository; the blueprint generates the token secret and supplies deployment-safe defaults.

| Variable | Required on Render | Purpose |
|----------|--------------------|---------|
| `AF_TOKEN_SECRET` | Yes | Secret used to sign login tokens. The blueprint generates this value; do not expose or reuse it elsewhere. |
| `HOST` | Yes | Must be `0.0.0.0` so Render can reach the server. Preconfigured by the blueprint. |
| `PORT` | No | HTTP port. Render supplies this automatically; the Docker image defaults to `4242` elsewhere. |
| `TITLE` | No | Display name shown in the app. Defaults to `AGENT FACTORY`. |
| `ENVIRONMENT` | No | Background theme: `arcade`, `farm`, `office`, or `mining`. Defaults to `arcade`. |
| `GRAPHIC_DEATH` | No | Set to `true` or `1` to enable graphic death effects. |

`NODE_ENV=production` is set by the Docker image and does not need to be configured in Render.

## How It Works

```
Claude/Codex Hooks  ──curl POST──>  Fastify Server  ──WebSocket──>  Browser (Phaser 3)
(ephemeral bash)                   (port 4242)                     (2D pixel art arcade)
```

1. **Hooks** fire on Claude Code/Codex events (session start/end, tool use, subagent spawn/stop)
2. The hook script reads `~/.config/agent-factory/config.json` for your identity
3. It `curl`s the event data to the server (fire-and-forget, never blocks Claude)
4. The server updates its in-memory state and broadcasts via WebSocket
5. The browser renders the Phaser 3 scene with animated avatars

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
│   ├── routes/       # POST /api/hooks, GET /api/health, GET /api/auth/token
│   ├── ws/           # WebSocket broadcast manager (per-socket auth)
│   └── cleanup.ts    # Stale session reaper (5 min timeout)
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
| `GET /api/health` | Server status (`{ status, agents, clients, uptime }`) |
| `GET /api/state` | All active agent sessions |
| `GET /api/config` | Server config (title, environment, graphicDeath) |

### WebSocket (`ws://host:4242/ws`)

**Server -> Client:** `full_state`, `agent_update`, `agent_remove`, `effect`, `chat_message`, `auth_result`, `control_result`, `control_revoked`

**Client -> Server:** `request_state`, `auth` (token login), `logout`, `control_claim`, `control_input`, `control_release`, `shoot`, `emote`, `chat`

## License

MIT
