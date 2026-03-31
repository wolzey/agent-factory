export const DEFAULT_PORT = 4242;
export const STALE_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const STALE_CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds
export const STOPPED_REMOVAL_DELAY_MS = 3000; // 3 seconds after session end
export const TOMBSTONE_DURATION_MS = 30_000; // 30 seconds tombstone lingers
export const MAX_BROADCAST_RATE_MS = 100; // Max 10 updates/sec per session
export const CHAT_MESSAGE_MAX_LENGTH = 200;
export const CHAT_FADE_TIMEOUT_MS = 15_000; // 15 seconds before chat fades

export const DEFAULT_AVATAR = {
  spriteIndex: 0,
  color: '#4a90d9',
  hat: null,
  trail: null,
};

// Named palette arrays for avatar customization
export const HAIR_STYLE_NAMES = [
  'Short Flat', 'Spiky', 'Long Sides', 'Cap',
  'Mohawk', 'Bald', 'Afro', 'Bandana',
];

export const HAIR_COLORS = [
  { name: 'Dark Brown', hex: '#332211' },
  { name: 'Medium Brown', hex: '#664422' },
  { name: 'Black', hex: '#222222' },
  { name: 'Light Brown', hex: '#aa6633' },
  { name: 'Dark Red', hex: '#880000' },
  { name: 'Chestnut', hex: '#553311' },
  { name: 'Gray', hex: '#444444' },
  { name: 'Sandy Blonde', hex: '#cc8844' },
  { name: 'Platinum Blonde', hex: '#e8d5b5' },
  { name: 'Auburn', hex: '#8b4513' },
  { name: 'Bright Red', hex: '#ff2200' },
  { name: 'Silver', hex: '#aaaaaa' },
  { name: 'Blue Black', hex: '#0a0a1a' },
  { name: 'Dirty Blonde', hex: '#b89a5a' },
];

export const SKIN_TONES = [
  { name: 'Light', hex: '#ffcc99' },
  { name: 'Warm Light', hex: '#f5c28a' },
  { name: 'Medium Light', hex: '#dba97a' },
  { name: 'Medium', hex: '#c68e5a' },
  { name: 'Medium Dark', hex: '#a16d42' },
  { name: 'Dark', hex: '#7a4e2d' },
];

export const SHIRT_COLORS = [
  { name: 'Blue', hex: '#4a90d9' },
  { name: 'Red', hex: '#ff6b6b' },
  { name: 'Green', hex: '#51cf66' },
  { name: 'Yellow', hex: '#ffd43b' },
  { name: 'Purple', hex: '#cc5de8' },
  { name: 'Orange', hex: '#ff922b' },
  { name: 'Teal', hex: '#20c997' },
  { name: 'Pink', hex: '#f06595' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Black', hex: '#333333' },
  { name: 'Charcoal', hex: '#555555' },
  { name: 'Crimson', hex: '#b22222' },
  { name: 'Lime', hex: '#a3e635' },
  { name: 'Navy', hex: '#1a1a5c' },
  { name: 'Maroon', hex: '#800040' },
  { name: 'Coral', hex: '#ff7f50' },
];

export const PANTS_COLORS = [
  { name: 'Navy', hex: '#2a2a3e' },
  { name: 'Dark Gray', hex: '#3d3d3d' },
  { name: 'Brown', hex: '#4a3728' },
  { name: 'Dark Green', hex: '#1a3a1a' },
  { name: 'Dark Purple', hex: '#2a1a3e' },
  { name: 'Black', hex: '#1a1a1a' },
  { name: 'Khaki', hex: '#8b7d5b' },
  { name: 'Olive', hex: '#4a5a2a' },
  { name: 'Charcoal', hex: '#333333' },
];

export const SHOE_COLORS = [
  { name: 'Black', hex: '#222222' },
  { name: 'Brown', hex: '#3d2a1a' },
  { name: 'Navy', hex: '#2a2a3e' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Red', hex: '#8b2222' },
  { name: 'Gray', hex: '#666666' },
  { name: 'Tan', hex: '#a0845a' },
];

export const FACIAL_HAIR_NAMES = [
  'None', 'Stubble', 'Mustache', 'Full Beard', 'Goatee', 'Soul Patch',
];

export const MOUTH_STYLE_NAMES = [
  'Default', 'Smile', 'Frown', 'Open', 'Teeth Grin', 'Tongue Out',
];

export const FACE_ACCESSORY_NAMES = [
  'None', 'Round Glasses', 'Sunglasses', 'Monocle', 'Eye Patch', 'Visor',
];

export const HEAD_ACCESSORY_NAMES = [
  'None', 'Crown', 'Top Hat', 'Halo', 'Devil Horns', 'Antenna', 'Flower',
];

export const SHIRT_DESIGN_NAMES = [
  'Solid', 'H-Stripe', 'V-Stripe', 'Heart', 'Star', 'Number 1', 'Skull',
  'Checkerboard', 'Diamond', 'Lightning', 'Dots', 'X-Cross',
];

export const VALID_EMOTES: import('./types.js').EmoteType[] = ['dance', 'jump', 'guitar', 'gun', 'laugh', 'wave', 'sleep', 'explode', 'dizzy', 'flex', 'rage', 'fart'];

export const DEFAULT_SERVER_CONFIG: import('./types.js').ServerConfig = {
  title: 'AGENT FACTORY',
  environment: 'arcade',
};

// Map tool names to agent activities
export function toolToActivity(toolName: string): import('./types.js').AgentActivity {
  const readTools = ['Read', 'Glob', 'Grep', 'LSP'];
  const writeTools = ['Write', 'Edit', 'NotebookEdit'];
  const searchTools = ['WebSearch', 'WebFetch'];
  const agentTools = ['Agent'];
  const planTools = ['EnterPlanMode'];
  const waitingTools = ['AskUserQuestion', 'ExitPlanMode'];

  if (readTools.includes(toolName)) return 'reading';
  if (writeTools.includes(toolName)) return 'writing';
  if (toolName === 'Bash') return 'running';
  if (searchTools.includes(toolName)) return 'searching';
  if (agentTools.includes(toolName)) return 'chatting';
  if (planTools.includes(toolName)) return 'planning';
  if (waitingTools.includes(toolName)) return 'waiting';
  if (toolName.startsWith('mcp__')) return 'running';
  return 'thinking';
}
