import { env } from "./env";

/** Minimal slice of GIPHY's response shape — only what the picker needs. */
export interface GiphyItem {
  id: string;
  description: string;
  /** Small, fast-loading preview for the grid. */
  previewUrl: string;
  /** Full-size GIF/sticker actually attached to the gist. */
  fullUrl: string;
}

interface GiphyApiResult {
  id: string;
  title?: string;
  images: {
    fixed_width_small?: { url: string };
    original?: { url: string };
  };
}

interface GiphyApiResponse {
  data: GiphyApiResult[];
}

const BASE_URL = "https://api.giphy.com/v1";

function mapResult(r: GiphyApiResult): GiphyItem | null {
  const preview = r.images.fixed_width_small?.url;
  const full = r.images.original?.url;
  if (!preview || !full) return null;
  return { id: r.id, description: r.title ?? "", previewUrl: preview, fullUrl: full };
}

async function giphyFetch(path: string, params: Record<string, string>): Promise<GiphyItem[]> {
  if (!env.GIPHY_API_KEY) return [];
  const query = new URLSearchParams({
    api_key: env.GIPHY_API_KEY,
    limit: "30",
    rating: "pg-13",
    ...params,
  });
  const res = await fetch(`${BASE_URL}${path}?${query.toString()}`);
  if (!res.ok) throw new Error(`GIPHY request failed (${res.status})`);
  const data: GiphyApiResponse = await res.json();
  return data.data.map(mapResult).filter((x): x is GiphyItem => x !== null);
}

/** Trending GIFs/stickers — shown before the user types a search. */
export function fetchTrending(kind: "gifs" | "stickers"): Promise<GiphyItem[]> {
  return giphyFetch(`/${kind}/trending`, {});
}

/** Search GIFs/stickers by term. */
export function searchGiphy(kind: "gifs" | "stickers", query: string): Promise<GiphyItem[]> {
  return giphyFetch(`/${kind}/search`, { q: query });
}
