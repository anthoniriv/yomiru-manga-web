import { ScrapeResult } from '@yomiru/shared';
import { BrowserPool } from './browser.js';
import { StrategyRegistry } from './strategies/registry.js';
import { fetchTextWithDnsFallback } from './net.js';

export class ScraperEngine {
  private registry: StrategyRegistry;
  private browserPool: BrowserPool;

  constructor() {
    this.registry = new StrategyRegistry();
    this.browserPool = new BrowserPool();
  }

  async scrape(url: string): Promise<ScrapeResult> {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname;
    const strategy = this.registry.getStrategy(domain);

    let html: string;

    if (strategy.usesApi) {
      // API-based strategies handle their own data fetching
      html = '';
    } else if (strategy.needsPlaywright) {
      html = await this.fetchWithPlaywright(url);
    } else {
      html = await this.fetchPageHtml(url);
    }

    const result = await strategy.parse(html, url);
    result.source_domain = domain;
    result.source_url = url;

    return result;
  }

  async fetchPageHtml(url: string): Promise<string> {
    try {
      return await this.fetchSimple(url);
    } catch {
      // Fallback to Playwright if simple fetch fails
      return this.fetchWithPlaywright(url);
    }
  }

  private async fetchSimple(url: string): Promise<string> {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    };

    // ZonaTMO chapter pages reject direct requests without a same-site referer.
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./i, '');
      if (host === 'zonatmo.com' && /^\/view_uploads\/\d+/i.test(parsed.pathname)) {
        headers.Referer = `${parsed.origin}/library`;
        headers.Origin = parsed.origin;
      }
    } catch {
      // Ignore malformed URL here; fetch will fail below with a regular error.
    }

    return fetchTextWithDnsFallback(url, {
      headers,
    });
  }

  private async fetchWithPlaywright(url: string): Promise<string> {
    return this.browserPool.getPage(url);
  }

  async close() {
    await this.browserPool.close();
  }
}
