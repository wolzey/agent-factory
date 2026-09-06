import Phaser from 'phaser';
import { VALID_EMOTES } from '@shared/constants';
import type { EmoteType } from '@shared/types';
import { EMOTE_GLYPHS } from './emotes';

const INNER_RADIUS = 45;
const OUTER_RADIUS = 150;
const LABEL_RADIUS = 103;

export class EmoteWheel {
  private container: Phaser.GameObjects.Container | null = null;
  private graphics: Phaser.GameObjects.Graphics | null = null;
  private labels: Phaser.GameObjects.Text[] = [];
  private selectedIndex = 0;
  private onSelect: ((emote: EmoteType) => void) | null = null;
  private pointerMoveHandler = (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer);
  private pointerDownHandler = (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer);

  constructor(private scene: Phaser.Scene) {}

  get isOpen(): boolean {
    return !!this.container;
  }

  show(onSelect: (emote: EmoteType) => void): void {
    if (this.isOpen) return;
    this.onSelect = onSelect;
    this.selectedIndex = 0;

    this.container = this.scene.add.container(400, 240).setDepth(2000);
    const backdrop = this.scene.add.rectangle(0, 0, 800, 480, 0x02030c, 0.72).setInteractive();
    this.container.add(backdrop);

    this.graphics = this.scene.add.graphics();
    this.container.add(this.graphics);

    const title = this.scene.add.text(0, -184, 'EMOTE LOADOUT', {
      fontFamily: 'monospace',
      fontSize: '17px',
      color: '#00ffff',
      fontStyle: 'bold',
      stroke: '#00151a',
      strokeThickness: 4,
    }).setOrigin(0.5);
    const hint = this.scene.add.text(0, 184, 'MOUSE / ← → SELECT   ENTER CONFIRM   ESC CANCEL', {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#8a91a8',
    }).setOrigin(0.5);
    this.container.add([title, hint]);

    const step = (Math.PI * 2) / VALID_EMOTES.length;
    this.labels = VALID_EMOTES.map((emote, index) => {
      const angle = -Math.PI / 2 + index * step;
      const label = this.scene.add.text(
        Math.cos(angle) * LABEL_RADIUS,
        Math.sin(angle) * LABEL_RADIUS,
        `${EMOTE_GLYPHS[emote]}\n${emote.toUpperCase()}`,
        {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#b8bfd3',
          align: 'center',
          fontStyle: 'bold',
        },
      ).setOrigin(0.5);
      this.container!.add(label);
      return label;
    });

    const center = this.scene.add.circle(0, 0, 35, 0x090b1d, 1)
      .setStrokeStyle(2, 0x00ffff, 0.75);
    const centerText = this.scene.add.text(0, 0, 'B\nEMOTES', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#ffffff',
      align: 'center',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.container.add([center, centerText]);

    this.scene.input.on('pointermove', this.pointerMoveHandler);
    this.scene.input.on('pointerdown', this.pointerDownHandler);
    this.render();
  }

  hide(): void {
    if (!this.container) return;
    this.scene.input.off('pointermove', this.pointerMoveHandler);
    this.scene.input.off('pointerdown', this.pointerDownHandler);
    this.container.destroy(true);
    this.container = null;
    this.graphics = null;
    this.labels = [];
    this.onSelect = null;
  }

  handleKey(event: KeyboardEvent): boolean {
    if (!this.isOpen) return false;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      this.selectedIndex = (this.selectedIndex - 1 + VALID_EMOTES.length) % VALID_EMOTES.length;
      this.render();
      return true;
    }
    if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      this.selectedIndex = (this.selectedIndex + 1) % VALID_EMOTES.length;
      this.render();
      return true;
    }
    if (event.code === 'Enter' || event.code === 'Space' || event.code === 'KeyB') {
      this.confirm();
      return true;
    }
    if (event.code === 'Escape') {
      this.hide();
      return true;
    }
    return true;
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.worldX - 400;
    const dy = pointer.worldY - 240;
    const distance = Math.hypot(dx, dy);
    if (distance < INNER_RADIUS || distance > OUTER_RADIUS + 20) return;

    const step = (Math.PI * 2) / VALID_EMOTES.length;
    const normalized = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    this.selectedIndex = Math.round(normalized / step) % VALID_EMOTES.length;
    this.render();
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const distance = Math.hypot(pointer.worldX - 400, pointer.worldY - 240);
    if (distance >= INNER_RADIUS && distance <= OUTER_RADIUS + 20) {
      this.confirm();
    }
  }

  private confirm(): void {
    const callback = this.onSelect;
    const emote = VALID_EMOTES[this.selectedIndex];
    this.hide();
    callback?.(emote);
  }

  private render(): void {
    if (!this.graphics) return;
    this.graphics.clear();
    const step = (Math.PI * 2) / VALID_EMOTES.length;

    for (let index = 0; index < VALID_EMOTES.length; index++) {
      const center = -Math.PI / 2 + index * step;
      const start = center - step / 2 + 0.012;
      const end = center + step / 2 - 0.012;
      const points: Phaser.Math.Vector2[] = [];
      for (let i = 0; i <= 8; i++) {
        const angle = start + (end - start) * (i / 8);
        points.push(new Phaser.Math.Vector2(Math.cos(angle) * OUTER_RADIUS, Math.sin(angle) * OUTER_RADIUS));
      }
      for (let i = 8; i >= 0; i--) {
        const angle = start + (end - start) * (i / 8);
        points.push(new Phaser.Math.Vector2(Math.cos(angle) * INNER_RADIUS, Math.sin(angle) * INNER_RADIUS));
      }

      const selected = index === this.selectedIndex;
      this.graphics.fillStyle(selected ? 0x00d8ff : 0x14182e, selected ? 0.72 : 0.94);
      this.graphics.fillPoints(points, true);
      this.graphics.lineStyle(selected ? 2 : 1, selected ? 0xffffff : 0x303755, selected ? 1 : 0.8);
      this.graphics.strokePoints(points, true);
      this.labels[index]?.setColor(selected ? '#ffffff' : '#a2aac2');
      this.labels[index]?.setScale(selected ? 1.16 : 1);
    }
  }
}
