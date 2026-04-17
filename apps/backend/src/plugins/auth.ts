import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authPluginFn(fastify: FastifyInstance) {
  fastify.decorateRequest('userId', '');

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing authorization token' });
    }

    const token = authHeader.substring(7);

    if (!fastify.supabase) {
      return reply.status(503).send({ error: 'Database not configured' });
    }

    const { data: { user }, error } = await fastify.supabase.auth.getUser(token);

    if (error || !user) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    request.userId = user.id;
  });
}

export const authPlugin = fp(authPluginFn, {
  name: 'auth',
  dependencies: ['supabase'],
});
