import { describe, expect, it } from 'vitest';
import { isInShotCorridor } from '../client/control/geometry';
import { facingForInput, isEditableTarget } from '../client/control/input';

describe('client control helpers', () => {
  it('detects editable elements without requiring a browser DOM', () => {
    expect(isEditableTarget({ tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'CANVAS', isContentEditable: false } as unknown as EventTarget)).toBe(false);
  });

  it('preserves a useful facing direction during diagonal input', () => {
    const diagonal = { up: true, down: false, left: false, right: true };
    expect(facingForInput(diagonal, 'right')).toBe('right');
    expect(facingForInput(diagonal, 'up')).toBe('up');
    expect(facingForInput({ up: false, down: true, left: false, right: false }, 'left')).toBe('down');
  });

  it('only hits avatars in the forward shot corridor', () => {
    const shooter = { x: 100, y: 100 };
    expect(isInShotCorridor(shooter, { x: 250, y: 115 }, 'right')).toBe(true);
    expect(isInShotCorridor(shooter, { x: 250, y: 145 }, 'right')).toBe(false);
    expect(isInShotCorridor(shooter, { x: 50, y: 100 }, 'right')).toBe(false);
    expect(isInShotCorridor(shooter, { x: 100, y: 20 }, 'up')).toBe(true);
    expect(isInShotCorridor(shooter, { x: 100, y: 310 }, 'down')).toBe(false);
  });
});
