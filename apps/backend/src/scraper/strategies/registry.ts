import { ScraperStrategy } from './base.js';
import { MangasnoseKaiStrategy } from './mangasnosekai.js';
import { ManhwaWebStrategy } from './manhwaweb.js';
import { ZonaTmoStrategy } from './zonatmo.js';
import { InMangaStrategy } from './inmanga.js';
import { ReadAnyBookStrategy } from './readanybook.js';
import { GenericStrategy } from './generic.js';

export class StrategyRegistry {
  private strategies: Map<string, ScraperStrategy> = new Map();
  private fallback: ScraperStrategy;

  constructor() {
    this.fallback = new GenericStrategy();

    // Register known site strategies
    this.register(new MangasnoseKaiStrategy());
    this.register(new ManhwaWebStrategy());
    this.register(new ZonaTmoStrategy());
    this.register(new InMangaStrategy());
    this.register(new ReadAnyBookStrategy());
    // Add more strategies here as needed:
    // this.register(new AsuraScansStrategy());
  }

  register(strategy: ScraperStrategy) {
    this.strategies.set(strategy.domain, strategy);
  }

  getStrategy(domain: string): ScraperStrategy {
    // Check for exact match
    const exact = this.strategies.get(domain);
    if (exact) return exact;

    // Check for subdomain match (e.g., www.mangasnosekai.com -> mangasnosekai.com)
    for (const [key, strategy] of this.strategies) {
      if (domain === key || domain.endsWith('.' + key)) {
        return strategy;
      }
    }

    return this.fallback;
  }

  getRegisteredDomains(): string[] {
    return Array.from(this.strategies.keys());
  }
}
