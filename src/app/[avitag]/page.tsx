import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { resolveServerAuthState } from "@/lib/serverAuth";
import { fetchStudentProfileByAvitag } from "@/lib/serverProfile";
import { ProfileView } from "./ProfileView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ avitag: string }>;
}): Promise<Metadata> {
  const { avitag } = await params;
  const profile = await fetchStudentProfileByAvitag(avitag);
  if (!profile) return { title: "Profile" };
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || avitag;
  return { title: `${name} (@${avitag})` };
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
  const { state, account, profiles } = await resolveServerAuthState();
  const profile = await fetchStudentProfileByAvitag(avitag);
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
      <ProfileView avitag={avitag} profile={profile} isOwnProfile={isOwnProfile} />
    </>
  );
}
