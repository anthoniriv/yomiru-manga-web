const JIKAN = 'https://api.jikan.moe/v4';

export interface MalResult {
  malId: number;
  title: string;
  synopsis: string | null;
  score: number | null;
  scoredBy: number | null;
  year: number | null;
  authors: string[];
  status: 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';
  genres: string[];
  themes: string[];
  demographics: string[];
  coverUrl: string | null;
  isAdult: boolean;
}

async function jfetch(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': 'yomiru/1.0' } });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    return jfetch(url);
  }
  if (!res.ok) throw new Error(`jikan ${res.status}`);
  return res.json();
}

function mapStatus(s: string): MalResult['status'] {
  const n = s.toLowerCase();
  if (n.includes('publishing') || n.includes('ongoing')) return 'ongoing';
  if (n.includes('finished') || n.includes('complete')) return 'completed';
  if (n.includes('hiatus')) return 'hiatus';
  if (n.includes('discontin') || n.includes('cancel')) return 'cancelled';
  return 'unknown';
}

function extractYear(entry: any): number | null {
  if (typeof entry?.published?.from === 'string') {
    const y = new Date(entry.published.from).getUTCFullYear();
    if (Number.isFinite(y)) return y;
  }
  if (entry?.published?.prop?.from?.year) return entry.published.prop.from.year;
  return null;
}

function normalize(entry: any): MalResult {
  const genres = (entry.genres ?? []).map((g: any) => g.name).filter(Boolean);
  const themes = (entry.themes ?? []).map((g: any) => g.name).filter(Boolean);
  const demos = (entry.demographics ?? []).map((g: any) => g.name).filter(Boolean);
  const explicitGenres = (entry.explicit_genres ?? []).map((g: any) => g.name).filter(Boolean);
  const allGenres = [...genres, ...themes, ...demos, ...explicitGenres];
  const adultish = ['Hentai', 'Erotica', 'Ecchi', 'Yaoi', 'Yuri', 'Adult', 'Smut'];
  const isAdult = allGenres.some((g) => adultish.includes(g));

  return {
    malId: entry.mal_id,
    title: entry.title,
    synopsis: entry.synopsis ?? null,
    score: entry.score ?? null,
    scoredBy: entry.scored_by ?? null,
    year: extractYear(entry),
    authors: (entry.authors ?? []).map((a: any) => a.name).filter(Boolean),
    status: mapStatus(entry.status ?? ''),
    genres,
    themes,
    demographics: demos,
    coverUrl: entry.images?.webp?.large_image_url ?? entry.images?.jpg?.large_image_url ?? null,
    isAdult,
  };
}

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleScore(query: string, entry: any): number {
  const q = normTitle(query);
  if (!q) return 0;
  const qTokens = q.split(' ').filter((w) => w.length >= 2);
  const qSet = new Set(qTokens);

  const candidates = [
    entry.title,
    entry.title_english,
    entry.title_japanese,
    ...(Array.isArray(entry.titles) ? entry.titles.map((t: any) => t.title) : []),
    ...(Array.isArray(entry.title_synonyms) ? entry.title_synonyms : []),
  ]
    .filter(Boolean)
    .map((t: string) => normTitle(t))
    .filter(Boolean);

  let best = 0;
  for (const c of candidates) {
    if (c === q) return 100;

    const shortSide = q.length <= c.length ? q : c;
    const longSide = q.length <= c.length ? c : q;

    // Require the shorter side to be at least 4 chars to count as substring match
    if (shortSide.length >= 4) {
      if (longSide.startsWith(shortSide)) best = Math.max(best, 90);
      else if (longSide.includes(` ${shortSide} `) || longSide.endsWith(` ${shortSide}`) || longSide.startsWith(`${shortSide} `)) {
        best = Math.max(best, 85);
      } else if (longSide.includes(shortSide) && shortSide.length >= 8) {
        best = Math.max(best, 75);
      }
    }

    const cTokens = c.split(' ').filter((w) => w.length >= 2);
    if (cTokens.length > 0 && qTokens.length > 0) {
      const hits = cTokens.filter((w) => qSet.has(w)).length;
      const ratio = hits / Math.max(qTokens.length, cTokens.length);
      if (ratio >= 0.8) best = Math.max(best, 88);
      else if (ratio >= 0.6) best = Math.max(best, 70);
    }
  }
  return best;
}

export async function searchMal(query: string, opts: { debug?: boolean } = {}): Promise<MalResult | null> {
  const url = `${JIKAN}/manga?q=${encodeURIComponent(query)}&limit=10&order_by=members&sort=desc`;
  const data = await jfetch(url);
  const list: any[] = Array.isArray(data?.data) ? data.data : [];
  if (list.length === 0) return null;

  const mangaTypes = list.filter((e) => {
    const type = (e.type ?? '').toLowerCase();
    return type === 'manga' || type === 'manhwa' || type === 'manhua' || type === 'oel';
  });
  const pool = mangaTypes.length > 0 ? mangaTypes : list;

  const scored = pool
    .map((e) => ({ entry: e, score: titleScore(query, e) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (opts.debug && best) {
    console.log(`  score=${best.score} query="${query}" → "${best.entry.title}"`);
  }
  if (!best || best.score < 85) return null;

  return normalize(best.entry);
}

const LOCALE_JUNK = new Set(['es', 'en', 'jp', 'ja', 'ko', 'zh', 'cn', 'fr', 'de', 'it', 'pt', 'ru']);

export async function findMalForSeries(
  title: string,
  altTitles: string[] = [],
  opts: { debug?: boolean } = {},
): Promise<MalResult | null> {
  const candidates = [title, ...altTitles]
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => {
      const n = normTitle(t);
      if (n.length < 4) return false;
      if (LOCALE_JUNK.has(n)) return false;
      return true;
    });
  const seen = new Set<string>();
  const unique = candidates.filter((t) => {
    const n = normTitle(t);
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
  for (const c of unique.slice(0, 3)) {
    try {
      const hit = await searchMal(c, opts);
      if (hit) return hit;
    } catch {
      // keep trying others
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  return null;
}
