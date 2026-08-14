import { cache } from "react";
import { cookies } from "next/headers";
import { env } from "./env";
import type { Profile } from "@/types";

/**
 * Server-side fetch for the public profile page (/[avitag]) — same "forward
 * the incoming cookie, hit the backend directly, never cache across
 * requests" pattern as fetchGistContext (serverGist.ts). Works identically
 * for a guest (no cookie forwarded, backend route is public anyway) and a
 * real session.
 *
 * Students only for now — the app has no signup path for kreator/kompany/
 * school profiles yet, and there's no single public "resolve avitag to
 * profile type" endpoint to probe the other tables with. A non-student
 * avitag (or one that genuinely doesn't exist / isn't ACTIVE) both come
 * back as null here; the caller renders notFound() for either.
 *
 * Wrapped in React's cache() — generateMetadata and the page component
 * both need this same profile and run in parallel (confirmed: measured
 * total request time is close to the slower of the two individually, not
 * their sum), but without this they'd each trigger their own real network
 * round-trip to the backend for identical data. cache() dedupes calls with
 * the same arguments within a single request, so this only actually fetches
 * once regardless of how many places call it.
 */
export const fetchStudentProfileByAvitag = cache(async function fetchStudentProfileByAvitag(
  avitag: string,
): Promise<Profile | null> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const res = await fetch(`${env.API_BASE}/profiles/students/${encodeURIComponent(avitag)}`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Profile };
    return json.data ?? null;
  } catch {
    return null;
  }
});
