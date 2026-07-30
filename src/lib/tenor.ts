import { env } from "./env";

/** Minimal slice of Tenor v2's response shape — only what the picker needs. */
export interface TenorItem {
  id: string;
  description: string;
  /** Small, fast-loading preview for the grid. */
  previewUrl: string;
  /** Full-size GIF/sticker actually attached to the gist. */
  fullUrl: string;
}

interface TenorApiResult {
  id: string;
  content_description?: string;
  media_formats: {
    tinygif?: { url: string };
    gif?: { url: string };
    tinygifsticker?: { url: string };
    gifsticker?: { url: string };
  };
}

interface TenorApiResponse {
  results: TenorApiResult[];
  next?: string;
}

const CLIENT_KEY = "kampos_web";
const BASE_URL = "https://tenor.googleapis.com/v2";

function mapResult(r: TenorApiResult): TenorItem | null {
  const preview = r.media_formats.tinygif?.url ?? r.media_formats.tinygifsticker?.url;
  const full = r.media_formats.gif?.url ?? r.media_formats.gifsticker?.url;
  if (!preview || !full) return null;
  return { id: r.id, description: r.content_description ?? "", previewUrl: preview, fullUrl: full };
}

async function tenorFetch(path: string, params: Record<string, string>): Promise<TenorItem[]> {
  if (!env.TENOR_API_KEY) return [];
  const query = new URLSearchParams({
    key: env.TENOR_API_KEY,
    client_key: CLIENT_KEY,
    limit: "30",
    contentfilter: "high",
    ...params,
  });
  const res = await fetch(`${BASE_URL}${path}?${query.toString()}`);
  if (!res.ok) throw new Error(`Tenor request failed (${res.status})`);
  const data: TenorApiResponse = await res.json();
  return data.results.map(mapResult).filter((x): x is TenorItem => x !== null);
}

/** Trending GIFs/stickers — shown before the user types a search. */
export function fetchTrending(kind: "gifs" | "stickers"): Promise<TenorItem[]> {
  return tenorFetch("/featured", kind === "stickers" ? { searchfilter: "sticker" } : {});
}

/** Search GIFs/stickers by term. */
export function searchTenor(kind: "gifs" | "stickers", query: string): Promise<TenorItem[]> {
  return tenorFetch("/search", { q: query, ...(kind === "stickers" ? { searchfilter: "sticker" } : {}) });
}
