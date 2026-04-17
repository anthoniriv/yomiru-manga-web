// Logger is provided by Fastify's built-in pino logger
// This file provides utility logging helpers

export function formatScrapeLog(url: string, duration: number, chaptersFound: number): string {
  return `Scraped ${url} in ${duration}ms - Found ${chaptersFound} chapters`;
}
