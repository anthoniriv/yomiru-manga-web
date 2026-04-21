import { FastifyInstance } from 'fastify';
import { getBackendPerfSnapshot, isPerfRequestAuthorized } from '../utils/perf.js';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'yomiru-api',
    };
  });

  fastify.get('/health/perf', async (request, reply) => {
    if (!isPerfRequestAuthorized(request)) {
      return reply.status(401).send({ ok: false, error: 'unauthorized' });
    }

    return {
      ok: true,
      source: 'backend',
      snapshot: getBackendPerfSnapshot(),
    };
  });
}
