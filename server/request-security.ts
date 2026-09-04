import type { FastifyRequest } from 'fastify';

export function usesSecureTransport(request: FastifyRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  if (request.ip === '127.0.0.1' || request.ip === '::1' || request.ip === '::ffff:127.0.0.1') return true;
  const forwarded = request.headers['x-forwarded-proto'];
  const protocol = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim();
  return request.protocol === 'https' || protocol === 'https';
}

export function isSameHostOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
