import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { healthRoutes } from './routes/health.js';
import { scrapeRoutes } from './routes/scrape.js';
import { bookRoutes } from './routes/books.js';
import { readerRoutes } from './routes/reader.js';
import { accountRoutes } from './routes/account.js';
import { authPlugin } from './plugins/auth.js';
import { supabasePlugin } from './plugins/supabase.js';
import { recordBackendRequestMetric } from './utils/perf.js';

const server = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  },
});

async function start() {
  // Plugins
  await server.register(cors, {
    origin: true,
    credentials: true,
  });

  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await server.register(supabasePlugin);
  await server.register(authPlugin);

  // Routes
  await server.register(healthRoutes);
  await server.register(scrapeRoutes, { prefix: '/api' });
  await server.register(bookRoutes, { prefix: '/api' });
  await server.register(readerRoutes, { prefix: '/api' });
  await server.register(accountRoutes, { prefix: '/api' });

  server.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url || request.url;
    recordBackendRequestMetric(`${request.method} ${route}`, reply.elapsedTime, reply.statusCode);
  });

  // Start
  const port = parseInt(process.env.PORT || '3001', 10);
  const host = process.env.HOST || '0.0.0.0';
  try {
    await server.listen({ port, host });
    server.log.info(`Server running on ${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
