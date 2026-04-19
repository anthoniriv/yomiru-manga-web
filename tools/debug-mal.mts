import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: resolve(process.cwd(), 'apps/web/.env') });

const JIKAN = 'https://api.jikan.moe/v4';

function normTitle(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleScore(query: string, entry: any): { score: number; via: string } {
  const q = normTitle(query);
  const qTokens = q.split(' ').filter((w) => w.length >= 2);
  const qSet = new Set(qTokens);
  const candidates = [
    entry.title, entry.title_english, entry.title_japanese,
    ...(Array.isArray(entry.titles) ? entry.titles.map((t: any) => t.title) : []),
    ...(Array.isArray(entry.title_synonyms) ? entry.title_synonyms : []),
  ].filter(Boolean).map((t: string) => normTitle(t)).filter(Boolean);

  let best = 0, via = '';
  for (const c of candidates) {
    if (c === q) return { score: 100, via: `exact:${c}` };
    const shortSide = q.length <= c.length ? q : c;
    const longSide = q.length <= c.length ? c : q;
    if (shortSide.length >= 4) {
      if (longSide.startsWith(shortSide) && best < 90) { best = 90; via = `startsWith:${c}`; }
      else if ((longSide.includes(` ${shortSide} `) || longSide.endsWith(` ${shortSide}`) || longSide.startsWith(`${shortSide} `)) && best < 85) { best = 85; via = `wordBoundary:${c}`; }
      else if (longSide.includes(shortSide) && shortSide.length >= 8 && best < 75) { best = 75; via = `substr:${c}`; }
    }
    const cTokens = c.split(' ').filter((w) => w.length >= 2);
    if (cTokens.length > 0 && qTokens.length > 0) {
      const hits = cTokens.filter((w) => qSet.has(w)).length;
      const ratio = hits / Math.max(qTokens.length, cTokens.length);
      if (ratio >= 0.8 && best < 88) { best = 88; via = `ratio:${c} hits=${hits}`; }
      else if (ratio >= 0.6 && best < 70) { best = 70; via = `ratio60:${c}`; }
    }
  }
  return { score: best, via };
}

async function search(q: string) {
  const res = await fetch(`${JIKAN}/manga?q=${encodeURIComponent(q)}&limit=10&order_by=members&sort=desc`);
  const data = await res.json();
  const list = data?.data ?? [];
  console.log(`\n=== QUERY: ${q} ===`);
  const scored = list.map((e: any) => ({ title: e.title, ...titleScore(q, e) })).sort((a: any, b: any) => b.score - a.score);
  for (const s of scored.slice(0, 5)) console.log(`  ${s.score}\t${s.title}\t[${s.via}]`);
}

await search('El caballero de la joven dama');
await new Promise((r) => setTimeout(r, 1500));
await search('Acosado por mujeres');
await new Promise((r) => setTimeout(r, 1500));
await search('Reencarné como el duque villano');
process.exit(0);
