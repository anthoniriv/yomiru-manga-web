import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), 'apps/web/.env') });

const { findBannerForSeries } = await import('../apps/web/src/lib/anilist.ts');

const titles = ['Chainsaw Man', 'Dandadan', 'One Piece', 'Queen Bee', 'Elfen Lied'];
for (const t of titles) {
  const hit = await findBannerForSeries(t);
  console.log(`${t.padEnd(18)} → ${hit?.bannerImage ?? '(none)'}`);
}
process.exit(0);
