import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: resolve(process.cwd(), 'apps/web/.env') });
const { searchMal, findMalForSeries } = await import('../apps/web/src/lib/mal.ts');
console.log('searchMal("es"):', (await searchMal('es', { debug: true }))?.title);
console.log('---');
const r = await findMalForSeries('Acosado por mujeres', ['Acosado por mujeres','es','Acosado por mujeres'], { debug: true });
console.log('RESULT:', r?.title);
process.exit(0);
