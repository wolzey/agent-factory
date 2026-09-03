import Phaser from 'phaser';
import { placeTooltip } from './tooltipLayout';
import type { Bounds, TargetRect } from './tooltipLayout';
import type { Rgb } from './skyPhase';
import { rgbToInt } from './skyPhase';

/** A small pixel-styled name tag drawn in world space, native to the arcade wall. */
export class SkylineTooltip {
  private readonly container: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly frame: Phaser.GameObjects.Rectangle;
  private readonly notch: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly highlight: Phaser.GameObjects.Rectangle;
  private fade?: Phaser.Tweens.Tween;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bounds: Bounds,
    private readonly reducedMotion: boolean,
    depth: number,
  ) {
    this.bg = scene.add.rectangle(0, 0, 10, 10, 0x0a0a1a, 0.94).setOrigin(0, 0);
    this.frame = scene.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0, 0);
    this.frame.setStrokeStyle(1, 0xffffff, 1);
    this.notch = scene.add.rectangle(0, 0, 3, 3, 0xffffff, 1).setOrigin(0.5, 0);
    this.label = scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '9px', color: '#ffffff' }).setOrigin(0, 0);
    this.container = scene.add.container(0, 0, [this.bg, this.frame, this.notch, this.label]).setDepth(depth).setVisible(false).setAlpha(0);
    this.highlight = scene.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0, 0).setDepth(depth - 0.5).setVisible(false);
    this.highlight.setStrokeStyle(1, 0xffffff, 0.9);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  get text(): string {
    return this.label.text;
  }

  /** Show `name` next to `target` (world rect), tinted with `accent`. */
  show(name: string, target: TargetRect, accent: Rgb): void {
    const color = rgbToInt(accent);
    this.label.setText(name).setColor(`#${color.toString(16).padStart(6, '0')}`);
    const width = Math.ceil(this.label.width) + 8;
    const height = Math.ceil(this.label.height) + 6;
    const place = placeTooltip(target, width, height, this.bounds);
    this.bg.setSize(width, height);
    this.frame.setSize(width, height).setStrokeStyle(1, color, 0.9);
    this.label.setPosition(4, 3);
    this.notch.setFillStyle(color, 0.9);
    this.notch.setPosition(place.notchX - place.x, place.below ? -3 : height);
    this.container.setPosition(place.x, place.y).setVisible(true);

    this.highlight.setPosition(target.x, target.y).setSize(target.width, target.height).setStrokeStyle(1, color, 0.9).setVisible(true);

    this.fade?.remove();
    if (this.reducedMotion) {
      this.container.setAlpha(1);
    } else {
      this.fade = this.scene.tweens.add({ targets: this.container, alpha: { from: this.container.alpha, to: 1 }, duration: 120 });
    }
  }

  hide(): void {
    this.fade?.remove();
    this.fade = undefined;
    this.container.setVisible(false).setAlpha(0);
    this.highlight.setVisible(false);
  }

  destroy(): void {
    this.fade?.remove();
    this.container.destroy(true);
    this.highlight.destroy();
  }
}
