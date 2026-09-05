import type { FastifyInstance } from 'fastify';
import type { TeamRoster } from '../team-roster.js';

export function registerTeamRoutes(app: FastifyInstance, team: TeamRoster) {
  // The same public names/avatars as the room, without tasks, paths or credentials.
  app.get('/api/team', (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return reply.send(team.snapshot());
  });
}
