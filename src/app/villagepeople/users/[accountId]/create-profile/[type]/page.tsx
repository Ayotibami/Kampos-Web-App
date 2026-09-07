import { notFound } from "next/navigation";
import { getAccountDetail } from "@/lib/serverUsers";
import { profileTypeFromPath } from "@/lib/profileEditFields";
import { CreateProfilePage } from "./CreateProfilePage";

/**
 * /villagepeople/users/[accountId]/create-profile/[type] — an admin
 * attaching a brand new profile to this account (see
 * AccountDetailManager.tsx's own "Create profile" button + type picker,
 * the only entry point into this route). `:type` is the same plural path
 * segment every other admin profile route already uses
 * (students/kreators/kompanies/schools/idiots — see profileEditFields.ts's
 * PROFILE_TYPE_PATH), validated here before rendering anything so a typo'd
 * or hand-edited URL 404s cleanly instead of reaching a form for a type
 * that doesn't exist.
 */
export default async function CreateProfileRoutePage({
  params,
}: {
  params: Promise<{ accountId: string; type: string }>;
}) {
  const { accountId, type } = await params;
  const profileType = profileTypeFromPath(type);
  if (!profileType) notFound();

  const detail = await getAccountDetail(accountId);
  if (!detail) notFound();

  return (
    <CreateProfilePage
      profileType={profileType}
      accountId={accountId}
      accountEmail={detail.account.email}
    />
  );
}
