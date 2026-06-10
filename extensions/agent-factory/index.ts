import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

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
  token?: string;
  avatar: AvatarConfig;
}

const CONFIG_PATH = join(homedir(), ".config", "agent-factory", "config.json");
const DEFAULT_SERVER_URL = "http://localhost:4242";
const DEFAULT_AVATAR: AvatarConfig = {
  spriteIndex: 0,
  color: "#4a90d9",
  hat: null,
  trail: null,
};

let sessionId = randomUUID();
let toolUseCount = 0;

function readConfig(): UserConfig {
  if (!existsSync(CONFIG_PATH)) {
    return {
      username: userInfo().username || "anonymous",
      serverUrl: DEFAULT_SERVER_URL,
      avatar: DEFAULT_AVATAR,
    };
  }

  const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<UserConfig>;
  return {
    username: parsed.username || userInfo().username || "anonymous",
    serverUrl: (parsed.serverUrl || DEFAULT_SERVER_URL).replace(/\/$/, ""),
    token: parsed.token,
    avatar: { ...DEFAULT_AVATAR, ...(parsed.avatar || {}) },
  };
}

function writeConfig(cfg: UserConfig) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify({ ...cfg, serverUrl: cfg.serverUrl.replace(/\/$/, "") }, null, 2)}\n`);
}

async function postJson(path: string, body: Record<string, unknown>) {
  const cfg = readConfig();
  try {
    await fetch(`${cfg.serverUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // Agent Factory visualization must never interfere with pi usage.
  }
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
      if (!existsSync(CONFIG_PATH)) writeConfig(readConfig());
      const editor = process.env.EDITOR || process.env.VISUAL || "vi";
      openTerminal(`${editor} ${CONFIG_PATH}`);
      ctx.ui.notify(`Opened ${CONFIG_PATH} in ${editor}`, "info");
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
    if (event.text.trim()) await postHook({ hook_event_name: "UserPromptSubmit", user_prompt: event.text }, ctx);
  });

  pi.on("tool_execution_start", async (event, ctx) => {
    toolUseCount += 1;
    await postHook({
      hook_event_name: "PreToolUse",
      tool_name: event.toolName,
      tool_input: event.args,
      activity: activityForTool(event.toolName),
      toolUseCount,
    }, ctx);
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    await postHook({
      hook_event_name: "PostToolUse",
      tool_name: event.toolName,
      tool_input: event.args,
      error: event.isError,
      toolUseCount,
    }, ctx);
  });

  pi.on("session_before_compact", async (_event, ctx) => postHook({ hook_event_name: "PreCompact" }, ctx));
  pi.on("session_compact", async (_event, ctx) => postHook({ hook_event_name: "PostCompact" }, ctx));
  pi.on("agent_end", async (_event, ctx) => postHook({ hook_event_name: "Stop" }, ctx));
  pi.on("session_shutdown", async (event, ctx) => postHook({ hook_event_name: "SessionEnd", reason: event.reason }, ctx));
}
