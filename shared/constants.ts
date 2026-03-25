export const DEFAULT_PORT = 4242;
export const STALE_SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const STALE_CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds
export const STOPPED_REMOVAL_DELAY_MS = 3000; // 3 seconds after session end
export const MAX_BROADCAST_RATE_MS = 100; // Max 10 updates/sec per session

export const DEFAULT_AVATAR = {
  spriteIndex: 0,
  color: '#4a90d9',
  hat: null,
  trail: null,
};

export const DEFAULT_SERVER_CONFIG: import('./types.js').ServerConfig = {
  title: 'AGENT FACTORY',
};

// Map tool names to agent activities
export function toolToActivity(toolName: string): import('./types.js').AgentActivity {
  const readTools = ['Read', 'Glob', 'Grep', 'LSP'];
  const writeTools = ['Write', 'Edit', 'NotebookEdit'];
  const searchTools = ['WebSearch', 'WebFetch'];
  const agentTools = ['Agent'];
  const planTools = ['EnterPlanMode'];

  if (readTools.includes(toolName)) return 'reading';
  if (writeTools.includes(toolName)) return 'writing';
  if (toolName === 'Bash') return 'running';
  if (searchTools.includes(toolName)) return 'searching';
  if (agentTools.includes(toolName)) return 'chatting';
  if (planTools.includes(toolName)) return 'planning';
  if (toolName.startsWith('mcp__')) return 'running';
  return 'thinking';
}
