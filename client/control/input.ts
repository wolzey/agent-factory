import type { ControlInputState, FacingDirection } from '@shared/types';

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as HTMLElement;
  if (element.isContentEditable) return true;
  if (typeof element.tagName !== 'string') return false;
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button';
}

export function facingForInput(input: ControlInputState, current: FacingDirection): FacingDirection {
  const dx = Number(input.right) - Number(input.left);
  const dy = Number(input.down) - Number(input.up);
  if (dx !== 0 && dy !== 0) {
    if (current === 'left' || current === 'right') return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }
  if (dx !== 0) return dx > 0 ? 'right' : 'left';
  if (dy !== 0) return dy > 0 ? 'down' : 'up';
  return current;
}
