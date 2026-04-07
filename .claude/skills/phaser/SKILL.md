---
name: phaser
description: |
  Agent Factory Phaser 3 game client patterns and conventions.
  Use when: editing files in client/, working with scenes, entities, sprites, tweens,
  animations, canvas textures, environment themes, or the game loop.
user-invocable: false
---

# Phaser — Agent Factory

Phaser 3.90.0 renders a 2D pixel-art factory floor where Claude Code agent sessions appear as
animated sprites. All textures are procedurally generated at boot time via Canvas API. The client
is purely reactive to WebSocket state updates from the Fastify server.

## Patterns

### Container-based Entity Composition

All game entities extend `Phaser.GameObjects.Container`, compositing child sprites, text, and
glow effects. Depth is set dynamically based on Y-position.

```typescript
// From: client/entities/AgentSprite.ts:28
export class AgentSprite extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite;
  private nametag: Phaser.GameObjects.Text;
  private neonGlow: Phaser.GameObjects.Sprite;
  // ...
}
```

### Procedural Texture Generation at Boot

All sprites, workstations, and floor tiles are drawn to canvas textures during `BootScene.create()`.
No external image assets are loaded.

```typescript
// From: client/scenes/BootScene.ts:609+
const canvas = this.textures.createCanvas('workstation_office', 64, 64);
const ctx = canvas.getContext();
ctx.fillStyle = '#3a3a5c';
ctx.fillRect(0, 0, 64, 64);
canvas.refresh();
```

### Tween-based Animation Choreography

Visual effects use `scene.tweens.add()` with chained `onComplete` callbacks for sequencing.

```typescript
// From: client/entities/AgentSprite.ts:209-220
this.scene.tweens.add({
  targets: this.neonGlow,
  alpha: { from: 0.8, to: 0 },
  duration: 500,
  onComplete: () => { this.destroy(); }
});
```

### Theme-driven Environment Rendering

Environment themes implement a consistent interface for generating textures and animations.
FactoryScene selects the active theme from server config.

```typescript
// From: client/environments/EnvironmentTheme.ts:118
export interface EnvironmentTheme {
  generateTextures(scene: Phaser.Scene): void;
  generateAnimations(scene: Phaser.Scene): void;
  drawBackground(scene: Phaser.Scene, width: number, height: number): void;
}
```

## Conventions

- **File naming**: PascalCase matching class name (`AgentSprite.ts`, `FactoryScene.ts`)
- **Directory structure**: `scenes/` (lifecycle), `entities/` (Container subclasses), `systems/` (non-Phaser managers), `environments/` (theme generators), `ui/` (DOM overlays), `audio/` (sound)
- **Texture keys**: snake_case (`arcade_cabinet`, `floor_office`, `agent_0`)
- **Animation keys**: snake_case with optional theme prefix (`arcade_idle`, `walk_right`)
- **Colors**: `0x` hex for Phaser tints, `#rrggbb` strings for canvas/CSS
- **UI overlays**: Chat, login, and command input are pure DOM elements, NOT Phaser objects

## Common Workflow: Adding a New Visual Effect

1. Define the effect type in `shared/types.ts` (add to `VisualEffect` union)
2. Handle it in `client/systems/AgentManager.ts` in the effect dispatch method
3. Implement the animation in `client/entities/AgentSprite.ts` using tweens
4. If it needs a new texture, generate it in `client/scenes/BootScene.ts`
5. Test with `pnpm dev` and trigger via the server API

## Anti-Patterns

### WARNING: Tween Callback Pyramids

Death/effect animations nest 3+ levels of `onComplete` callbacks. Use Phaser's timeline API
or extract each stage into a named method.

```typescript
// BAD — from client/entities/AgentSprite.ts:222-254
scene.tweens.add({
  onComplete: () => {
    scene.tweens.add({
      onComplete: () => {
        scene.tweens.add({ ... });
      }
    });
  }
});

// GOOD — extract stages:
dieStage1() { scene.tweens.add({ onComplete: () => this.dieStage2() }); }
dieStage2() { scene.tweens.add({ onComplete: () => this.dieStage3() }); }
```

### WARNING: Hardcoded Colors Outside Theme System

`SubagentSprite.ts` defines `SUBAGENT_COLORS` as a local constant array instead of sourcing
colors from the active environment theme, breaking theme consistency.

## References

- [Detailed patterns and examples](references/patterns.md)

## Related Skills

- **[typescript](../typescript/SKILL.md)** — Shared types for agent state and effects
- **[fastify](../fastify/SKILL.md)** — Server providing WebSocket state updates
