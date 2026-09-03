import { worldRectToScreen } from './screenMap';
import type { ScreenRect, ViewSpec, WorldRect } from './screenMap';
import { SILICON_SLOPES_HEADING } from './partners';

export interface FocusTarget {
  id: string;
  name: string;
  /** World-space rectangle of the building. */
  rect: WorldRect;
}

export interface FocusLayerHandlers {
  onFocus(target: FocusTarget): void;
  onBlur(target: FocusTarget): void;
}

/**
 * Keyboard-accessible twin of the pointer hover: one focusable button per partner
 * building, positioned over the scaled canvas. The buttons ignore the pointer entirely so
 * mouse behaviour stays with Phaser; focusing one shows the same tooltip the pointer would.
 */
export class PartnerFocusLayer {
  private readonly root: HTMLUListElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly onResize = () => this.reposition();

  constructor(
    private readonly host: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly view: ViewSpec,
    private readonly targets: readonly FocusTarget[],
    handlers: FocusLayerHandlers,
  ) {
    this.root = document.createElement('ul');
    this.root.className = 'skyline-partners';
    this.root.setAttribute('aria-label', SILICON_SLOPES_HEADING);
    for (const target of targets) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.partnerId = target.id;
      button.setAttribute('aria-label', target.name);
      button.addEventListener('focus', () => handlers.onFocus(target));
      button.addEventListener('blur', () => handlers.onBlur(target));
      item.appendChild(button);
      this.root.appendChild(item);
      this.buttons.set(target.id, button);
    }
    host.appendChild(this.root);
    window.addEventListener('resize', this.onResize);
    this.reposition();
  }

  /** Re-place every button over its building using the canvas's current CSS rectangle. */
  reposition(): void {
    const canvasRect = this.canvas.getBoundingClientRect();
    const hostRect = this.host.getBoundingClientRect();
    if (canvasRect.width === 0) return;
    const canvas: ScreenRect = {
      left: canvasRect.left - hostRect.left,
      top: canvasRect.top - hostRect.top,
      width: canvasRect.width,
      height: canvasRect.height,
    };
    for (const target of this.targets) {
      const button = this.buttons.get(target.id);
      if (!button) continue;
      const rect = worldRectToScreen(target.rect, canvas, this.view);
      button.style.left = `${rect.left}px`;
      button.style.top = `${rect.top}px`;
      button.style.width = `${rect.width}px`;
      button.style.height = `${rect.height}px`;
    }
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
    this.buttons.clear();
  }
}
