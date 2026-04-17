import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { r2Upload } from '../packages/r2/src/index.js';

async function main() {
  const candidates = [
    './storage/media/manga/100-formas-de-martirizar-a-la-princesa/c0001/0000.webp',
  ];
  for (const p of candidates) {
    const buf = await readFile(p).catch(() => null);
    if (!buf) continue;
    console.log(`Uploading ${p} (${buf.length} bytes)...`);
    await r2Upload('test/ping.jpg', buf, 'image/jpeg');
    console.log('SUCCESS');
    return;
  }
  console.error('No test file found');
  process.exit(1);
}

main().catch((err) => { console.error('FAIL:', err.message); process.exit(1); });
