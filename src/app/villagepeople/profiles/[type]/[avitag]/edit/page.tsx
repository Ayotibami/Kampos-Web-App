import { notFound } from "next/navigation";
import { getProfile } from "@/lib/serverProfilesAdmin";
import { profileTypeFromPath } from "@/lib/profileEditFields";
import { ProfileEditPage } from "./ProfileEditPage";

/**
 * /villagepeople/profiles/[type]/[avitag]/edit — the full-page profile
 * editor that replaced ProfileEditModal.tsx. Lives one level below the
 * profile-view page (../page.tsx), which is what every row/card in this
 * app now links to by default — this route is reached via that page's own
 * "Edit" button, or directly from a Profiles-tab row's pencil icon. See
 * ProfileEditPage.tsx's own doc comment for why `router.back()` is the
 * right way home rather than a fixed href.
 *
 * `:type` is validated against the 5 known plural path segments
 * (students/kreators/kompanies/schools/idiots) before anything is fetched
 * — an unknown segment 404s immediately rather than hitting the backend
 * with a type it doesn't recognize.
 */
export default async function ProfileEditRoute({
  params,
}: {
  params: Promise<{ type: string; avitag: string }>;
}) {
  const { type, avitag } = await params;
  const profileType = profileTypeFromPath(type);
  if (!profileType) notFound();

  const profile = await getProfile(type, avitag);
  if (!profile) notFound();

  return <ProfileEditPage profileType={profileType} avitag={avitag} initialProfile={profile} />;
}
