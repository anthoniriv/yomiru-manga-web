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
  const candidates = [
    entry.title,
    entry.title_english,
    entry.title_japanese,
    ...(Array.isArray(entry.titles) ? entry.titles.map((t: any) => t.title) : []),
    ...(Array.isArray(entry.title_synonyms) ? entry.title_synonyms : []),
  ]
    .filter(Boolean)
    .map((t: string) => normTitle(t));

  let best = 0;
  for (const c of candidates) {
    if (!c) continue;
    if (c === q) return 100;
    if (c.startsWith(q) || q.startsWith(c)) best = Math.max(best, 80);
    else if (c.includes(q) || q.includes(c)) best = Math.max(best, 60);
    else {
      const qw = new Set(q.split(' '));
      const cw = c.split(' ');
      const hits = cw.filter((w) => qw.has(w)).length;
      if (hits > 0) best = Math.max(best, Math.round((hits / Math.max(qw.size, cw.length)) * 50));
    }
  }
  return best;
}

export async function searchMal(query: string): Promise<MalResult | null> {
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
  if (!best || best.score < 50) return null;

  return normalize(best.entry);
}

export async function findMalForSeries(
  title: string,
  altTitles: string[] = [],
): Promise<MalResult | null> {
  const candidates = [title, ...altTitles].map((t) => t.trim()).filter(Boolean);
  for (const c of candidates.slice(0, 3)) {
    try {
      const hit = await searchMal(c);
      if (hit) return hit;
    } catch {
      // keep trying others
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  return null;
}
