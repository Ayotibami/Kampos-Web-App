import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { resolveServerAuthState } from "@/lib/serverAuth";
import { fetchStudentProfileByAvitag, normalizeStudentProfile } from "@/lib/serverProfile";
import { fetchUserGists } from "@/lib/serverGist";
import { ProfileView } from "./ProfileView";

// Keeps a long bio (up to LIMITS.bio = 250 chars) plus avitag/campus/major
// from running past what most platforms show anyway before truncating it
// themselves mid-word — same reasoning the gist page's own description
// truncation already uses.
const OG_DESCRIPTION_MAX_CHARS = 200;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ avitag: string }>;
}): Promise<Metadata> {
  const { avitag } = await params;
  const profile = await fetchStudentProfileByAvitag(avitag);
  if (!profile) return { title: "Profile" };

  const { displayName, bio, campusName, majorName } = normalizeStudentProfile(profile);
  // Bare avitag, no @ prefix — Kampos doesn't use that convention anywhere
  // else, so the share title/description/card don't start using it here.
  const title = `${displayName} (${avitag})`;

  // Avitag, then bio (their own words, when they've written one), then
  // campus/major — each part just drops out if missing, so a profile with
  // no bio reads straight from avitag to campus/major instead of leaving a
  // gap. Full campus/major names ("University of Lagos"), not the raw short
  // tags — this is prose, not a chip; the OG *image* still uses the short
  // uppercase tags for its pills, matching the gist card's own chip style.
  const parts = [avitag, bio, campusName, majorName].filter(Boolean);
  let description = parts.join(" · ");
  if (description.length > OG_DESCRIPTION_MAX_CHARS) {
    description = `${description.slice(0, OG_DESCRIPTION_MAX_CHARS).trimEnd()}…`;
  }

  const imageUrl = `/api/og/profile/${encodeURIComponent(avitag)}`;

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: imageUrl, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ avitag: string }>;
}) {
  const { avitag } = await params;
  // Deliberately NOT gateServer — a profile is public, same reasoning as
  // /gist/[gistId]: a guest (or a share-preview crawler) should see it with
  // no login wall, and the backend's GET /profiles/students/:avitag route
  // has no auth requirement at all.
  //
  // Auth state, profile data, and the profile's first page of gists all
  // fetched in parallel — no added latency. If the profile doesn't exist,
  // notFound() takes over regardless of what the other two returned.
  const [{ state, account, profiles }, profile, { gists: initialGists, total: initialGistTotal }] =
    await Promise.all([
      resolveServerAuthState(),
      fetchStudentProfileByAvitag(avitag),
      fetchUserGists(avitag),
    ]);
  if (!profile) notFound();

  // avitag is globally unique, so if it's anywhere in the signed-in
  // viewer's own profiles list, this is their own profile — no separate
  // "compare account_id" call needed. Resolved server-side (not left to a
  // client-side check) so the owner-only chrome (Settings, theme toggle)
  // never flashes in/out after hydration.
  const isOwnProfile = profiles.some((p) => p.avitag === avitag);

  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <ProfileView
        avitag={avitag}
        profile={profile}
        isOwnProfile={isOwnProfile}
        initialGists={initialGists}
        initialGistTotal={initialGistTotal}
      />
    </>
  );
}
