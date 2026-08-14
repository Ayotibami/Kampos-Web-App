import { env } from "./env";

/** Minimal slice of GIPHY's response shape — only what the picker needs. */
export interface GiphyItem {
  id: string;
  description: string;
  /** Small, fast-loading preview for the grid. */
  previewUrl: string;
  /** Full-size GIF/sticker actually attached to the gist. */
  fullUrl: string;
  /** Real dimensions of `fullUrl` (GIPHY's `images.original`), same purpose
   * as the width/height Cloudinary reports for uploaded media — lets the
   * gist card reserve the right amount of space before the GIF loads
   * instead of jumping into place. Null if GIPHY's response is somehow
   * missing or unparseable, same as any other media without known dims. */
  width: number | null;
  height: number | null;
}

interface GiphyApiResult {
  id: string;
  title?: string;
  images: {
    fixed_width_small?: { url: string };
    // GIPHY reports numeric fields as strings throughout its API.
    original?: { url: string; width?: string; height?: string };
  };
}

interface GiphyApiResponse {
  data: GiphyApiResult[];
}

const BASE_URL = "https://api.giphy.com/v1";

// GIPHY's free tier is capped at 100 calls/hour — reopening the picker (or
// retyping a search someone already ran this session) shouldn't cost a
// fresh call for the exact same result. Module-level, so it survives the
// picker unmounting/remounting, and lives for the whole page session — no
// need to evict; a handful of trending/search entries is negligible memory.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: GiphyItem[]; expiresAt: number }>();

function mapResult(r: GiphyApiResult): GiphyItem | null {
  const preview = r.images.fixed_width_small?.url;
  const full = r.images.original?.url;
  if (!preview || !full) return null;
  const width = Number(r.images.original?.width);
  const height = Number(r.images.original?.height);
  return {
    id: r.id,
    description: r.title ?? "",
    previewUrl: preview,
    fullUrl: full,
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
  };
}

async function giphyFetch(path: string, params: Record<string, string>): Promise<GiphyItem[]> {
  if (!env.GIPHY_API_KEY) return [];

  const cacheKey = `${path}?${new URLSearchParams(params).toString()}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const query = new URLSearchParams({
    api_key: env.GIPHY_API_KEY,
    limit: "50", // GIPHY's actual max per request
    rating: "pg-13",
    ...params,
  });
  const res = await fetch(`${BASE_URL}${path}?${query.toString()}`);
  if (!res.ok) throw new Error(`GIPHY request failed (${res.status})`);
  const data: GiphyApiResponse = await res.json();
  const items = data.data.map(mapResult).filter((x): x is GiphyItem => x !== null);

  cache.set(cacheKey, { data: items, expiresAt: Date.now() + CACHE_TTL_MS });
  return items;
}

/** Trending GIFs/stickers — shown before the user types a search. */
export function fetchTrending(kind: "gifs" | "stickers"): Promise<GiphyItem[]> {
  return giphyFetch(`/${kind}/trending`, {});
}

/** Search GIFs/stickers by term. */
export function searchGiphy(kind: "gifs" | "stickers", query: string): Promise<GiphyItem[]> {
  return giphyFetch(`/${kind}/search`, { q: query });
}
