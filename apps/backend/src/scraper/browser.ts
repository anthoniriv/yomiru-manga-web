import { Browser } from 'playwright';

export class CloudflareError extends Error {
  constructor(domain: string) {
    super(
      `El sitio ${domain} está protegido por Cloudflare y no se pudo escanear automáticamente en este intento.`,
    );
    this.name = 'CloudflareError';
  }
}

export class BrowserPool {
  private browser: Browser | null = null;

  async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      const { chromium } = await import('playwright');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
        ],
      });
    }
    return this.browser;
  }

  async getPage(url: string): Promise<string> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();

    // Block heavy resources we don't need — speeds up load significantly
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['image', 'media', 'font'].includes(type)) {
        return route.abort();
      }
      const reqUrl = route.request().url();
      if (
        /google(ads|tag|syndication)|doubleclick|facebook\.net|analytics|adservice/i.test(reqUrl)
      ) {
        return route.abort();
      }
      return route.continue();
    });

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      // Give JS time to render dynamic content
      await page.waitForTimeout(3000);

      const html = await page.content();

      // Detect Cloudflare challenge
      if (this.isCloudflareChallenge(html)) {
        // Wait a bit more in case it auto-resolves
        await page.waitForTimeout(5000);
        const html2 = await page.content();
        if (this.isCloudflareChallenge(html2)) {
          const domain = new URL(url).hostname;
          throw new CloudflareError(domain);
        }
        return html2;
      }

      return html;
    } finally {
      await context.close();
    }
  }

  private isCloudflareChallenge(html: string): boolean {
    return (
      html.includes('Just a moment') ||
      html.includes('Un momento') ||
      html.includes('challenge-platform') ||
      html.includes('cf-browser-verification') ||
      (html.includes('cloudflare') && html.includes('challenge'))
    );
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
