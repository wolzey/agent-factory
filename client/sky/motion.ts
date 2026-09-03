/** Reduced-motion detection that is safe to call outside a browser. */
export type MediaQuery = (query: string) => { matches: boolean } | null | undefined;

export function prefersReducedMotion(query?: MediaQuery): boolean {
  try {
    const matcher: MediaQuery | undefined =
      query ?? (typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia.bind(globalThis) : undefined);
    if (!matcher) return false;
    return Boolean(matcher('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}
