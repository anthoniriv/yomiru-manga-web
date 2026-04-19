import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), 'apps/web/.env') });

const { findMalForSeries } = await import('../apps/web/src/lib/mal.ts');

const titles = ['Blue Lock', 'Chainsaw Man', 'Haikyu!!', 'Naruto'];
for (const t of titles) {
  const mal = await findMalForSeries(t);
  console.log(`--- ${t} ---`);
  console.log({
    title: mal?.title,
    status: mal?.status,
    year: mal?.year,
    genres: mal?.genres,
    themes: mal?.themes,
    demographics: mal?.demographics,
    isAdult: mal?.isAdult,
  });
  await new Promise((r) => setTimeout(r, 1100));
}
process.exit(0);
