import test from 'node:test';
import assert from 'node:assert/strict';
import { ManhwaWebStrategy } from './manhwaweb.js';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

test('ManhwaWebStrategy retries with decoded slug when first API request returns 404', async () => {
  const strategy = new ManhwaWebStrategy();
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);

    if (requestedUrls.length === 1) {
      return new Response('Not found', { status: 404 });
    }

    return jsonResponse({
      the_real_name: 'Titulo real',
      _sinopsis: 'Sinopsis',
      _imagen: 'https://cdn.example.com/cover.jpg',
      chapters: [
        { chapter: '1', link: 'https://www.manhwaweb.com/leer/a-1' },
        { chapter: '2', link: 'https://www.manhwaweb.com/leer/a-2' },
      ],
    });
  }) as typeof fetch;

  try {
    const result = await strategy.parse(
      '',
      'https://www.manhwaweb.com/manga/%C2%BFque_le_sucede_a_esta_familia__1710385671081',
    );

    assert.equal(requestedUrls.length, 2);
    assert.match(requestedUrls[0], /%25C2%25BF/);
    assert.match(requestedUrls[1], /%C2%BF/);

    assert.equal(result.title, 'Titulo real');
    assert.equal(result.description, 'Sinopsis');
    assert.equal(result.cover_image_url, 'https://cdn.example.com/cover.jpg');
    assert.equal(result.chapters.length, 2);
    assert.equal(result.chapters[0].number, 1);
    assert.equal(result.chapters[1].number, 2);
    assert.equal(result.warnings.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ManhwaWebStrategy surfaces API warning for non-404 failures', async () => {
  const strategy = new ManhwaWebStrategy();

  globalThis.fetch = (async () => new Response('Server error', { status: 500 })) as typeof fetch;

  try {
    const result = await strategy.parse('', 'https://www.manhwaweb.com/manga/slug-test');
    assert.equal(result.chapters.length, 0);
    assert.ok(result.warnings.some((warning) => warning.includes('ManhwaWeb API error: 500')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
