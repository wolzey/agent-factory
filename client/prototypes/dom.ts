export function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Prototype element is missing: ${selector}`);
  return element;
}

// Overlay sync runs every frame. Writing only real changes keeps an unchanged DOM from
// invalidating style, so the next layout read in the frame does not force a recalculation.
export function setHidden(element: HTMLElement, hidden: boolean): void {
  if (element.hidden !== hidden) element.hidden = hidden;
}

/** Rounded to 1/100px so the serialized inline value compares equal on the next frame. */
export function setPixels(element: HTMLElement, property: 'left' | 'top' | 'width' | 'height', value: number): void {
  const text = `${Math.round(value * 100) / 100}px`;
  if (element.style[property] !== text) element.style[property] = text;
}
