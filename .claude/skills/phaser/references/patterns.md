# Phaser Patterns — Detailed Reference

## Scene Architecture

### Three-Scene Setup

**Where**: `client/main.ts`, `client/scenes/BootScene.ts`, `client/scenes/FactoryScene.ts`, `client/scenes/UIScene.ts`

**What**: The game runs three scenes:
1. **BootScene** — Generates all textures and animations procedurally, then transitions to FactoryScene
2. **FactoryScene** — Main game scene rendering the factory floor, agents, and effects
3. **UIScene** — Overlay scene for UI elements running parallel to FactoryScene

**Why**: Separating boot from gameplay allows expensive canvas operations to run once. The UI scene runs independently so UI state doesn't conflict with game rendering.

### Scene Data Sharing via Registry

**Where**: `client/scenes/FactoryScene.ts:144`

**What**: BootScene stores fetched server config in `this.registry.set('serverConfig', data)`. FactoryScene retrieves it with `this.registry.get('serverConfig')`.

**Why**: Avoids re-fetching config and keeps scenes loosely coupled without direct references.

## Entity System

### AgentSprite Composition

**Where**: `client/entities/AgentSprite.ts`

**What**: Each agent is a Container with 5+ children:
- `neonGlow` — Sprite for activity indicator glow
- `sprite` — Main character sprite with walk/idle animations
- `nametag` — Text label below the character
- `actionUnderlay` / `actionOverlay` — Activity indicator layers

**Why**: Container-based composition allows moving all parts together while independently tweening individual children (e.g., pulsing the glow without moving the sprite).

### Frame-rate Normalized Movement

**Where**: `client/entities/AgentSprite.ts:120-143`

**What**: Movement uses `moveSpeed * delta / 1000` where `delta` is the frame time in ms. Direction is determined by comparing `Math.abs(dx)` vs `Math.abs(dy)` to select the appropriate walk animation.

```typescript
// From: client/entities/AgentSprite.ts:120-135
update(delta: number) {
  if (!this.target) return;
  const dx = this.target.x - this.x;
  const dy = this.target.y - this.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 2) { this.arriveAtTarget(); return; }
  const step = this.moveSpeed * delta / 1000;
  this.x += (dx / dist) * step;
  this.y += (dy / dist) * step;
}
```

### SubagentSprite Lifecycle

**Where**: `client/entities/SubagentSprite.ts`

**What**: Subagents spawn from a parent agent, animate to a workstation, play a work animation, then return and despawn. Each gets a color from the `SUBAGENT_COLORS` array.

**Why**: Visual representation of Claude Code spawning sub-agents for parallel tasks.

## Texture Generation

### Canvas-based Procedural Art

**Where**: `client/scenes/BootScene.ts:500-1184`

**What**: All game art is generated programmatically using Canvas 2D context:
- Agent avatars: 32x32 pixel art composed from hair, face, body, clothing layers
- Workstations: Theme-specific desk/machine sprites
- Floor tiles: Repeating patterns per environment theme
- Decorative elements: Theme-specific props (arcade cabinets, farm elements, mining carts)

**Why**: No external asset pipeline needed. Art style is consistent and can be modified in code. New themes can be added by implementing the `EnvironmentTheme` interface.

### Theme System

**Where**: `client/environments/EnvironmentTheme.ts`, `client/environments/ArcadeTheme.ts`, `client/environments/OfficeTheme.ts`, `client/environments/FarmTheme.ts`, `client/environments/MiningTheme.ts`

**What**: Each theme implements `generateTextures()`, `generateAnimations()`, and `drawBackground()`. Themes are selected based on server config `environment` field.

```typescript
// From: client/environments/EnvironmentTheme.ts:118
export interface EnvironmentTheme {
  generateTextures(scene: Phaser.Scene): void;
  generateAnimations(scene: Phaser.Scene): void;
  drawBackground(scene: Phaser.Scene, width: number, height: number): void;
}
```

**Variations**: ArcadeTheme generates animated cabinet sprites with idle/active frames. MiningTheme generates mine cart tracks and ore deposits. Each theme's textures are prefixed with the theme name in texture keys.

## Manager Pattern

### AgentManager as State Bridge

**Where**: `client/systems/AgentManager.ts`

**What**: AgentManager is NOT a Phaser object. It receives state updates from the WebSocket and translates them into entity operations:
- `upsertAgent()` — Creates or updates AgentSprite instances
- `removeAgent()` — Triggers death animation and cleanup
- `triggerEffect()` — Dispatches visual effects to the correct agent

**Why**: Separates network/state concerns from Phaser rendering. The manager holds Maps of active agents and their workstation assignments.

### LayoutManager for Spatial Organization

**Where**: `client/systems/LayoutManager.ts`

**What**: Calculates workstation positions in a grid layout based on scene dimensions. Assigns agents to available workstations.

**Why**: Automatic spatial arrangement without manual coordinate management. New agents get the next available slot.

## Audio

### jsfxr Sound Bank

**Where**: `client/audio/SoundBank.ts`

**What**: Sound effects are synthesized at runtime using jsfxr (8-bit sound generator). Each effect type has a preset configuration. Sounds are pre-rendered to AudioBuffers on initialization.

**Why**: Matches the pixel-art aesthetic with retro sound effects. No audio files to load.

## Edge Cases & Gotchas

- **Canvas `refresh()` is required**: After drawing to a canvas texture, you MUST call `canvas.refresh()` or the texture won't update. Missing this causes invisible sprites.
- **Depth sorting by Y**: Agents further down the screen render on top. The formula `7 + y * 0.001` ensures consistent layering. Changing the base depth (7) affects all entity layering.
- **DOM overlays exist outside Phaser**: ChatOverlay, LoginOverlay, and CommandInput are pure HTML/CSS elements appended to the DOM. They don't participate in Phaser's scene graph or camera system.
- **No Phaser plugins**: This project uses zero Phaser plugins. All functionality is built with core Phaser APIs.
- **Animation key conflicts**: If two themes define the same animation key, the last one registered wins. Theme-prefixed keys prevent this.
