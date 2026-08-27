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

export interface NormalizedStudentProfile {
  displayName: string;
  bio: string;
  imageUrl: string | null;
  /** Full label ("University of Lagos") when the backend sent one, else the
   * short tag — for prose/headings. */
  campusName: string | null;
  majorName: string | null;
  /** Always the short tag ("unilag"), never the full name — for compact
   * chips, same as GistTags.tsx / the gist OG card use for the same fields. */
  campusTag: string | null;
  majorTag: string | null;
  level: number | string | null;
}

/**
 * Typed, defaulted read of Profile's otherwise-loosely-typed fields
 * (Profile is `[key: string]: unknown` — see types/index.ts) — the same
 * extraction ProfileView.tsx already does inline for rendering, pulled out
 * here since generateMetadata and the profile OG image route both need the
 * identical shape and neither one is the client component ProfileView is.
 */
export function normalizeStudentProfile(profile: Profile): NormalizedStudentProfile {
  const firstName = String(profile.first_name ?? "");
  const lastName = String(profile.last_name ?? "");
  const bio = String(profile.bio ?? "").trim();
  const imageUrl = (profile.image_url as string | null | undefined) ?? null;
  const level = (profile.level as number | string | null | undefined) ?? null;
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || profile.avitag;
  const campusName =
    typeof profile.campus_name === "string"
      ? profile.campus_name
      : typeof profile.campus_tag === "string"
        ? profile.campus_tag
        : null;
  const majorName =
    typeof profile.major_name === "string"
      ? profile.major_name
      : typeof profile.major_tag === "string"
        ? profile.major_tag
        : null;
  const campusTag = typeof profile.campus_tag === "string" ? profile.campus_tag : null;
  const majorTag = typeof profile.major_tag === "string" ? profile.major_tag : null;
  return { displayName, bio, imageUrl, campusName, majorName, campusTag, majorTag, level };
}
