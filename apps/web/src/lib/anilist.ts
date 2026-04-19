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

export async function searchAnilist(query: string): Promise<AnilistResult | null> {
  const data = await gfetch(SEARCH_QUERY, { search: query });
  const list: any[] = data?.data?.Page?.media ?? [];
  if (list.length === 0) return null;
  const withBanner = list.find((e) => e.bannerImage);
  return normalize(withBanner ?? list[0]);
}

export async function findBannerForSeries(
  title: string,
  altTitles: string[] = [],
): Promise<AnilistResult | null> {
  const candidates = [title, ...altTitles].map((t) => t.trim()).filter(Boolean);
  for (const c of candidates.slice(0, 3)) {
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
