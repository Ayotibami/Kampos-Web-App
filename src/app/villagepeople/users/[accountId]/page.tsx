import { notFound } from "next/navigation";
import { resolveServerAuthState } from "@/lib/serverAuth";
import { isKingRole } from "@/lib/roles";
import { getAccountDetail } from "@/lib/serverUsers";
import { AccountDetailManager } from "./AccountDetailManager";

/**
 * /villagepeople/users/[accountId] — one account's full detail: the
 * account itself plus every profile under it. Reachable by any admin
 * (VillagePeopleLayout's own gate already confirmed that) — only the
 * email-edit control rendered inside AccountDetailManager is king-gated,
 * via `isKing` computed here off the same resolveServerAuthState() result
 * the layout's gate used (cache()-wrapped, so this costs no extra
 * round-trip — same reasoning admins/page.tsx's own re-check documents).
 */
export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const [{ account }, detail] = await Promise.all([
    resolveServerAuthState(),
    getAccountDetail(accountId),
  ]);

  if (!detail) notFound();

  return <AccountDetailManager initialDetail={detail} isKing={isKingRole(account?.role)} />;
}
