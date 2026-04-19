import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), 'apps/web/.env') });

const { findMalForSeries } = await import('../apps/web/src/lib/mal.ts');

// mix: real matches + Spanish-only translations + long weird titles
const titles = [
  'Blue Lock',
  'Chainsaw Man',
  'Naruto',
  'One Piece',
  'Warui otoko ni dakaretara - Karaiku no wana kara nogarera renai',
  'La condesa se ve obligada a emparejarse con un caballero de élite',
  'Enseñanzas de un loto blanco absolutamente hermoso',
  'Carta a Keats',
  'Queen Bee',
  'Elfen Lied',
  'Attack on titan: The nigth after battle',
  'Berserk',
  'Dandadan',
];
for (const t of titles) {
  const hit = await findMalForSeries(t, [], { debug: true });
  console.log(`${t.slice(0, 45).padEnd(45)} → ${hit?.title ?? 'NULL'}`);
  await new Promise((r) => setTimeout(r, 1100));
}
process.exit(0);
