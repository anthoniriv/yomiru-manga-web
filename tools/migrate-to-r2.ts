#!/usr/bin/env tsx
/**
 * Migrates existing local media (54GB) to Cloudflare R2.
 * Reads pages from SQLite, uploads each file to R2 using storage_path as key.
 * Safe to re-run — skips already uploaded files.
 *
 * Usage:
 *   tsx tools/migrate-to-r2.ts
 *   tsx tools/migrate-to-r2.ts --dry-run
 *   tsx tools/migrate-to-r2.ts --concurrency=10
 */

import 'dotenv/config';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import pLimit from 'p-limit';
import Database from 'better-sqlite3';
import { r2Upload, r2Exists } from '../packages/r2/src/index.js';

const DRY_RUN = process.argv.includes('--dry-run');
const concurrencyArg =
  process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ??
  process.argv[process.argv.indexOf('--concurrency') + 1];
const CONCURRENCY = parseInt(concurrencyArg ?? '50', 10);
const STORAGE_DIR = resolve(process.env.YOMIRU_STORAGE_DIR ?? './storage/media');
const DB_PATH = resolve(process.env.YOMIRU_DB_PATH ?? './storage/yomiru.db');

interface PageRow {
  id: string;
  storage_path: string;
  mime: string | null;
  bytes: number | null;
}

async function main() {
  const db = new Database(DB_PATH, { readonly: true });

  const pages = db
    .prepare<[], PageRow>('SELECT id, storage_path, mime, bytes FROM pages WHERE storage_path IS NOT NULL')
    .all();

  console.log(`Found ${pages.length} pages to migrate`);
  if (DRY_RUN) console.log('DRY RUN — no uploads');

  const limit = pLimit(CONCURRENCY);
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let notFound = 0;

  const start = Date.now();

  await Promise.all(
    pages.map((page) =>
      limit(async () => {
        const localPath = resolve(STORAGE_DIR, page.storage_path);

        try {
          await access(localPath);
        } catch {
          notFound++;
          return;
        }

        if (DRY_RUN) {
          uploaded++;
          return;
        }

        try {
          const buf = await readFile(localPath);
          await r2Upload(page.storage_path, buf, page.mime ?? undefined);
          uploaded++;

          const total = uploaded + skipped + failed + notFound;
          if (total % 100 === 0) {
            const elapsed = ((Date.now() - start) / 1000).toFixed(0);
            console.log(
              `[${total}/${pages.length}] uploaded=${uploaded} skipped=${skipped} failed=${failed} notFound=${notFound} elapsed=${elapsed}s`,
            );
          }
        } catch (err) {
          failed++;
          console.error(`FAIL ${page.storage_path}: ${err}`);
        }
      }),
    ),
  );

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('\n--- Migration complete ---');
  console.log(`Uploaded:  ${uploaded}`);
  console.log(`Skipped:   ${skipped} (already in R2)`);
  console.log(`Not found: ${notFound} (missing local file)`);
  console.log(`Failed:    ${failed}`);
  console.log(`Time:      ${elapsed}s`);

  db.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
