import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { ScraperEngine } from '../scraper/engine.js';
import { CloudflareError } from '../scraper/browser.js';

const ScrapeBody = Type.Object({
  url: Type.String({ format: 'uri', minLength: 10 }),
});

let scraperEngine: ScraperEngine | null = null;

function getEngine(): ScraperEngine {
  if (!scraperEngine) {
    scraperEngine = new ScraperEngine();
  }
  return scraperEngine;
}

export async function scrapeRoutes(fastify: FastifyInstance) {
  fastify.post('/scrape', {
    schema: { body: ScrapeBody },
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { url } = request.body as { url: string };

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return reply.status(400).send({
          success: false,
          error: 'invalid_url',
          details: 'Only http and https URLs are supported',
        });
      }

      const engine = getEngine();
      const result = await engine.scrape(url);
      return { success: true, data: result };
    } catch (error) {
      fastify.log.error(error, 'Scrape failed for URL: %s', url);

      if (error instanceof CloudflareError) {
        return reply.status(403).send({
          success: false,
          error: 'cloudflare_protected',
          details: error.message,
        });
      }

      return reply.status(422).send({
        success: false,
        error: 'scrape_failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
