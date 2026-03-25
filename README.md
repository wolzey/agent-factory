# Agent Factory

A 2D pixel art visualization of Claude Code agent sessions. Watch your team's agents work in a retro arcade game room in real time.

![Retro arcade themed visualization](https://img.shields.io/badge/theme-retro%20arcade-ff00ff)
![Claude Code hooks](https://img.shields.io/badge/powered%20by-Claude%20Code%20hooks-00ffff)

## What it does

- Each active Claude Code session appears as an animated pixel art avatar
- Working agents stand at arcade cabinets with neon glow effects
- Idle agents hang out in the lounge area
- Subagents orbit their parent with a purple tint
- Hover over any avatar to see session details (username, project, current tool)
- Team members connect to a shared server to see everyone's agents at once

## Quick Install (Team Members)

If someone on your team is already running the server, just install the hooks:

```bash
curl -fsSL https://raw.githubusercontent.com/wolzey/agent-factory/main/install.sh -o /tmp/af-install.sh && bash /tmp/af-install.sh
```

This runs an interactive wizard that:
1. Asks for your display name
2. Asks for the server URL (they'll give you this)
3. Lets you pick an avatar color and style
4. Installs the hooks into your Claude Code settings

**Requirements:** `jq`, `curl`, Claude Code installed

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
# curl -fsSL https://raw.githubusercontent.com/wolzey/agent-factory/main/install.sh -o /tmp/af-install.sh && bash /tmp/af-install.sh
# and enter the ngrok URL when prompted
```

### Production

```bash
pnpm build
pnpm start  # serves on port 4242 (both API and static client)
```

Set `PORT` and `HOST` environment variables to customize.

## How It Works

```
Claude Code Hooks  ──curl POST──>  Fastify Server  ──WebSocket──>  Browser (Phaser 3)
(ephemeral bash)                   (port 4242)                     (2D pixel art arcade)
```

1. **Hooks** fire on Claude Code events (session start/end, tool use, subagent spawn/stop)
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

## Configuration

Your config lives at `~/.config/agent-factory/config.json`:

```json
{
  "username": "ethan",
  "serverUrl": "http://localhost:4242",
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
| `avatar.spriteIndex` | Character style (0-7) |
| `avatar.color` | Hex color for your avatar tint |
| `avatar.hat` | Hat accessory (future feature) |
| `avatar.trail` | Trail effect (future feature) |

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/wolzey/agent-factory/main/uninstall.sh -o /tmp/af-uninstall.sh && bash /tmp/af-uninstall.sh
```

This removes all hook entries from `~/.claude/settings.json` (surgically via jq, preserving your other hooks) and deletes `~/.config/agent-factory/`.

## Architecture

```
agent-factory/
├── server/           # Fastify HTTP + WebSocket server
│   ├── index.ts      # Entrypoint (port 4242)
│   ├── state.ts      # In-memory session state machine
│   ├── routes/       # POST /api/hooks, GET /api/health
│   ├── ws/           # WebSocket broadcast manager
│   └── cleanup.ts    # Stale session reaper (5 min timeout)
├── client/           # Phaser 3 browser app
│   ├── scenes/       # BootScene, FactoryScene, UIScene
│   ├── entities/     # AgentSprite, SubagentSprite, Machine
│   ├── systems/      # AgentManager, LayoutManager
│   └── network/      # WebSocket client with auto-reconnect
├── shared/           # Types and constants shared between server/client
├── hooks/            # Claude Code hook scripts
│   ├── install.sh    # Full installer (for server operators)
│   └── team-install.sh  # Lightweight team installer
└── install.sh        # Interactive wizard installer (curl-friendly)
```

## API

### `POST /api/hooks`

Receives hook events from Claude Code. Body is the hook JSON enriched with `username` and `avatar`.

### `GET /api/health`

Returns server status:

```json
{ "status": "ok", "agents": 3, "clients": 2, "uptime": 3600 }
```

### `GET /api/state`

Returns all active agent sessions.

### `ws://host:4242/ws`

WebSocket endpoint for browser clients. Sends `full_state`, `agent_update`, `agent_remove`, and `effect` messages.

## License

MIT
