import { notFound } from "next/navigation";
import { getProfile } from "@/lib/serverProfilesAdmin";
import { listGists } from "@/lib/serverGistsAdmin";
import { listSpots } from "@/lib/serverSpotsAdmin";
import { profileTypeFromPath } from "@/lib/profileEditFields";
import { ProfileViewPage } from "./ProfileViewPage";

const GISTS_PAGE_SIZE = 20;
const SPOTS_PAGE_SIZE = 20;

/**
 * /villagepeople/profiles/[type]/[avitag] — the profile-view page. This is
 * what every profile row/card in the admin panel now links to by default
 * (Profiles tabs' own row, Account detail's per-profile card) — full
 * read-only profile info plus that profile's own gists, so an admin can see
 * and moderate everything about one person in one place instead of jumping
 * between the Profiles tab and All Gists filtered by hand. Editing lives one
 * level below, at ./edit (reached via this page's own Edit button).
 *
 * `:type` is validated against the 5 known plural path segments before
 * anything is fetched, same as the edit route.
 */
export default async function ProfileViewRoute({
  params,
}: {
  params: Promise<{ type: string; avitag: string }>;
}) {
  const { type, avitag } = await params;
  const profileType = profileTypeFromPath(type);
  if (!profileType) notFound();

  const profile = await getProfile(type, avitag);
  if (!profile) notFound();

  const [initialGists, { spots: initialSpots, total: initialSpotsTotal }] = await Promise.all([
    listGists({ avitag, limit: GISTS_PAGE_SIZE }),
    listSpots({ avitag, limit: SPOTS_PAGE_SIZE }),
  ]);

  return (
    <ProfileViewPage
      profileType={profileType}
      typePath={type}
      avitag={avitag}
      initialProfile={profile}
      initialGists={initialGists}
      initialSpots={initialSpots}
      initialSpotsTotal={initialSpotsTotal}
    />
  );
}
