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

export async function searchMal(query: string): Promise<MalResult | null> {
  // order by `members` desc: most members first — usually the main work, not spinoffs.
  const url = `${JIKAN}/manga?q=${encodeURIComponent(query)}&limit=5&order_by=members&sort=desc`;
  const data = await jfetch(url);
  const list: any[] = Array.isArray(data?.data) ? data.data : [];
  if (list.length === 0) return null;

  // Prefer manga type entries and drop spinoffs/doujinshi/novel
  const preferred = list.find((e) => {
    const type = (e.type ?? '').toLowerCase();
    return type === 'manga' || type === 'manhwa' || type === 'manhua';
  }) ?? list[0];

  return normalize(preferred);
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
