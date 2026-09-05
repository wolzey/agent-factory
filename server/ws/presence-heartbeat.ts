import type { WebSocket } from '@fastify/websocket';

/** A lost network must not leave someone's browser lit up indefinitely. */
export function watchPresenceConnection(socket: WebSocket) {
  let responded = true;
  const pong = () => { responded = true; };
  const timer = setInterval(() => {
    if (!responded) { socket.terminate(); return; }
    responded = false;
    try { socket.ping(); } catch { socket.terminate(); }
  }, 30_000);
  const dispose = () => {
    clearInterval(timer); socket.off('pong', pong); socket.off('close', dispose); socket.off('error', dispose);
  };
  socket.on('pong', pong); socket.on('close', dispose); socket.on('error', dispose);
  return dispose;
}
