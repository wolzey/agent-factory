export function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Prototype element is missing: ${selector}`);
  return element;
}
