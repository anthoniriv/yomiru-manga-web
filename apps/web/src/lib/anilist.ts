const ENDPOINT = 'https://graphql.anilist.co';

export interface AnilistResult {
  anilistId: number;
  title: string;
  bannerImage: string | null;
  coverImage: string | null;
}

const SEARCH_QUERY = `
  query ($search: String) {
    Page(page: 1, perPage: 5) {
      media(search: $search, type: MANGA, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
        id
        title { romaji english native }
        bannerImage
        coverImage { extraLarge large }
        format
        countryOfOrigin
      }
    }
  }
`;

async function gfetch(query: string, variables: Record<string, unknown>): Promise<any> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    return gfetch(query, variables);
  }
  if (!res.ok) throw new Error(`anilist ${res.status}`);
  return res.json();
}

function normalize(entry: any): AnilistResult {
  return {
    anilistId: entry.id,
    title: entry.title?.english || entry.title?.romaji || entry.title?.native || '',
    bannerImage: entry.bannerImage ?? null,
    coverImage: entry.coverImage?.extraLarge ?? entry.coverImage?.large ?? null,
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
  if (q.length < 4) return 0;
  const qTokens = q.split(' ').filter((w) => w.length >= 2);
  const qSet = new Set(qTokens);

  const candidates = [
    entry.title?.romaji,
    entry.title?.english,
    entry.title?.native,
  ]
    .filter(Boolean)
    .map((t: string) => normTitle(t))
    .filter((t) => t.length >= 4);

  let best = 0;
  for (const c of candidates) {
    if (c === q) return 100;
    const shortSide = q.length <= c.length ? q : c;
    const longSide = q.length <= c.length ? c : q;
    if (shortSide.length >= 4) {
      if (longSide.startsWith(shortSide)) best = Math.max(best, 90);
      else if (longSide.includes(` ${shortSide} `) || longSide.endsWith(` ${shortSide}`) || longSide.startsWith(`${shortSide} `)) {
        best = Math.max(best, 85);
      }
    }
    const cTokens = c.split(' ').filter((w) => w.length >= 2);
    if (cTokens.length > 0 && qTokens.length > 0) {
      const hits = cTokens.filter((w) => qSet.has(w)).length;
      const ratio = hits / Math.max(qTokens.length, cTokens.length);
      if (ratio >= 0.8) best = Math.max(best, 88);
    }
  }
  return best;
}

const LOCALE_JUNK = new Set(['es', 'en', 'jp', 'ja', 'ko', 'zh', 'cn', 'fr', 'de', 'it', 'pt', 'ru']);

export async function searchAnilist(query: string): Promise<AnilistResult | null> {
  const data = await gfetch(SEARCH_QUERY, { search: query });
  const list: any[] = data?.data?.Page?.media ?? [];
  if (list.length === 0) return null;

  const scored = list
    .map((e) => ({ entry: e, score: titleScore(query, e) }))
    .filter((s) => s.score >= 85)
    .sort((a, b) => {
      const aBan = a.entry.bannerImage ? 1 : 0;
      const bBan = b.entry.bannerImage ? 1 : 0;
      if (aBan !== bBan) return bBan - aBan;
      return b.score - a.score;
    });

  if (scored.length === 0) return null;
  return normalize(scored[0].entry);
}

export async function findBannerForSeries(
  title: string,
  altTitles: string[] = [],
): Promise<AnilistResult | null> {
  const candidates = [title, ...altTitles]
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => {
      const n = normTitle(t);
      return n.length >= 4 && !LOCALE_JUNK.has(n);
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
      const hit = await searchAnilist(c);
      if (hit?.bannerImage) return hit;
    } catch {
      // keep trying
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return null;
}
