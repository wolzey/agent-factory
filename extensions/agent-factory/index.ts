import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

interface AvatarConfig {
  spriteIndex: number;
  color: string;
  hat: string | null;
  trail: string | null;
  [key: string]: unknown;
}

interface UserConfig {
  username: string;
  serverUrl: string;
  avatar: AvatarConfig;
}

const DEFAULT_SERVER_URL = "http://localhost:4242";
const DEFAULT_AVATAR: AvatarConfig = {
  spriteIndex: 0,
  color: "#4a90d9",
  hat: null,
  trail: null,
};

let sessionId = randomUUID();
let toolUseCount = 0;

function configDir(): string {
  return process.env.AGENT_FACTORY_CONFIG_DIR || join(homedir(), ".config", "agent-factory");
}

function configPath(): string {
  return join(configDir(), "config.json");
}

function identityPath(): string {
  return join(configDir(), "identity.json");
}

function readOrCreateDeviceSecret(): string | undefined {
  const path = identityPath();
  try {
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const secret = `afd1_${randomBytes(32).toString("base64url")}`;
      try {
        writeFileSync(path, `${JSON.stringify({ version: 1, secret }, null, 2)}\n`, {
          encoding: "utf8",
          mode: 0o600,
          flag: "wx",
        });
      } catch {
        // Another hook or process may have created the shared identity first.
      }
    }

    const parsed = JSON.parse(readFileSync(path, "utf8")) as { version?: number; secret?: string };
    if (parsed.version !== 1 || !/^afd1_[A-Za-z0-9_-]{43}$/.test(parsed.secret || "")) return undefined;
    chmodSync(path, 0o600);
    return parsed.secret;
  } catch {
    return undefined;
  }
}

function readConfig(): UserConfig {
  const path = configPath();
  if (!existsSync(path)) {
    return {
      username: userInfo().username || "anonymous",
      serverUrl: DEFAULT_SERVER_URL,
      avatar: DEFAULT_AVATAR,
    };
  }

  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<UserConfig>;
  return {
    username: parsed.username || userInfo().username || "anonymous",
    serverUrl: (parsed.serverUrl || DEFAULT_SERVER_URL).replace(/\/$/, ""),
    avatar: { ...DEFAULT_AVATAR, ...(parsed.avatar || {}) },
  };
}

function writeConfig(cfg: UserConfig) {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ ...cfg, serverUrl: cfg.serverUrl.replace(/\/$/, "") }, null, 2)}\n`);
}

async function postJson(path: string, body: Record<string, unknown>) {
  const cfg = readConfig();
  const deviceSecret = readOrCreateDeviceSecret();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (deviceSecret) headers.Authorization = `Bearer ${deviceSecret}`;
  try {
    await fetch(`${cfg.serverUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // Agent Factory visualization must never interfere with pi usage.
  }
}


/**
 * The same redaction the shell hook applies, for the pi path.
 *
 * This extension posts to the same endpoint, so without it a pi session streams
 * its prompts and tool arguments to the server even though the Claude/Codex hook
 * no longer does. The server drops those fields at ingest, but by then they have
 * already left the machine, which is the thing being prevented.
 */
const MAX_DERIVED_LENGTH = 200;
const WORKTREE_TOOLS = new Set(["EnterWorktree", "ExitWorktree"]);

function renameFrom(text: string): string | undefined {
  const match = text.match(/^\/rename\s+(.+)/);
  if (!match) return undefined;
  const name = match[1].trim();
  return name ? name.slice(0, MAX_DERIVED_LENGTH) : undefined;
}

function worktreeNameFrom(toolName: string, args: unknown): string | undefined {
  if (!WORKTREE_TOOLS.has(toolName) || !args || typeof args !== "object") return undefined;
  const name = (args as Record<string, unknown>).name;
  return typeof name === "string" ? name.slice(0, MAX_DERIVED_LENGTH) : undefined;
}

function gitActionFrom(toolName: string, args: unknown): "commit" | "pr_merge" | undefined {
  if (toolName !== "Bash" || !args || typeof args !== "object") return undefined;
  const command = (args as Record<string, unknown>).command;
  if (typeof command !== "string") return undefined;
  if (/git\s+commit\b/.test(command)) return "commit";
  if (/gh\s+pr\s+merge\b|git\s+merge\b/.test(command)) return "pr_merge";
  return undefined;
}

async function postHook(event: Record<string, unknown>, ctx?: ExtensionContext) {
  const cfg = readConfig();
  await postJson("/api/hooks", {
    ...event,
    session_id: sessionId,
    cwd: ctx?.cwd || process.cwd(),
    username: cfg.username,
    avatar: cfg.avatar,
    source: "pi",
  });
}

function runDetached(command: string, args: string[] = []) {
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function openTerminal(command: string) {
  const escaped = command.replace(/"/g, '\\"');
  switch (platform()) {
    case "darwin":
      runDetached("osascript", ["-e", `tell application "Terminal" to do script "${escaped}"`]);
      break;
    case "win32":
      runDetached("cmd.exe", ["/c", "start", "cmd.exe", "/k", command]);
      break;
    default:
      runDetached("sh", ["-lc", `x-terminal-emulator -e sh -lc '${command.replace(/'/g, "'\\''")}; exec sh' || gnome-terminal -- sh -lc '${command.replace(/'/g, "'\\''")}; exec sh' || konsole -e sh -lc '${command.replace(/'/g, "'\\''")}; exec sh'`]);
  }
}

function activityForTool(toolName: string): string {
  const name = toolName.toLowerCase();
  if (["read", "glob", "grep"].some((n) => name.includes(n))) return "reading";
  if (["write", "edit"].some((n) => name.includes(n))) return "writing";
  if (name.includes("bash")) return "running";
  if (name.includes("search") || name.includes("fetch") || name.includes("scrape")) return "searching";
  if (name.includes("agent")) return "chatting";
  if (name.includes("plan")) return "planning";
  return "thinking";
}

export default function agentFactoryPiExtension(pi: ExtensionAPI) {
  pi.registerCommand("af-avatar", {
    description: "Open Agent Factory avatar designer in a new terminal",
    handler: async (_args, ctx) => {
      openTerminal("agent-factory avatar");
      ctx.ui.notify("Opened Agent Factory avatar designer", "info");
    },
  });

  pi.registerCommand("af-configure", {
    description: "Open $EDITOR for ~/.config/agent-factory/config.json",
    handler: async (_args, ctx) => {
      const path = configPath();
      if (!existsSync(path)) writeConfig(readConfig());
      readOrCreateDeviceSecret();
      const editor = process.env.EDITOR || process.env.VISUAL || "vi";
      openTerminal(`${editor} ${path}`);
      ctx.ui.notify(`Opened ${path} in ${editor}`, "info");
    },
  });

  pi.registerCommand("af-emote", {
    description: "Trigger an Agent Factory emote (e.g. /af-emote wave)",
    handler: async (args, ctx) => {
      const cfg = readConfig();
      await postJson("/api/emote", { username: cfg.username, emote: args.trim() || "wave" });
      ctx.ui.notify(`Sent emote: ${args.trim() || "wave"}`, "info");
    },
  });

  pi.registerCommand("af-chat", {
    description: "Send an Agent Factory chat message",
    handler: async (args, ctx) => {
      const message = args.trim();
      if (!message) {
        ctx.ui.notify("Usage: /af-chat <message>", "warning");
        return;
      }
      const cfg = readConfig();
      await postJson("/api/chat", { username: cfg.username, message });
    },
  });

  pi.registerCommand("af-status", {
    description: "Show Agent Factory connection/config status",
    handler: async (_args, ctx) => {
      const cfg = readConfig();
      ctx.ui.notify(`Agent Factory: ${cfg.username} @ ${cfg.serverUrl}`, "info");
    },
  });

  pi.on("session_start", async (event, ctx) => {
    if (event.reason !== "reload") sessionId = randomUUID();
    toolUseCount = 0;
    await postHook({ hook_event_name: "SessionStart", reason: event.reason }, ctx);
  });

  pi.on("input", async (event, ctx) => {
    if (!event.text.trim()) return;
    // Only the name from `/rename <name>`; the prompt itself is not sent.
    const sessionName = renameFrom(event.text);
    await postHook({ hook_event_name: "UserPromptSubmit", ...(sessionName ? { session_name: sessionName } : {}) }, ctx);
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    toolUseCount += 1;
    const sessionName = worktreeNameFrom(event.toolName, event.args);
    await postHook({
      hook_event_name: "PreToolUse",
      tool_name: event.toolName,
      activity: activityForTool(event.toolName),
      toolUseCount,
      ...(sessionName ? { session_name: sessionName } : {}),
    }, ctx);
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    // Derived here for the same reason as in the shell hook: the server plays
    // the effect, but the command line never needs to leave this machine.
    const gitAction = gitActionFrom(event.toolName, event.args);
    const sessionName = worktreeNameFrom(event.toolName, event.args);
    await postHook({
      hook_event_name: "PostToolUse",
      tool_name: event.toolName,
      error: event.isError,
      toolUseCount,
      ...(gitAction ? { git_action: gitAction } : {}),
      ...(sessionName ? { session_name: sessionName } : {}),
    }, ctx);
  });

  pi.on("session_before_compact", async (_event, ctx) => postHook({ hook_event_name: "PreCompact" }, ctx));
  pi.on("session_compact", async (_event, ctx) => postHook({ hook_event_name: "PostCompact" }, ctx));
  pi.on("agent_end", async (_event, ctx) => postHook({ hook_event_name: "Stop" }, ctx));
  pi.on("session_shutdown", async (event, ctx) => postHook({ hook_event_name: "SessionEnd", reason: event.reason }, ctx));
}
