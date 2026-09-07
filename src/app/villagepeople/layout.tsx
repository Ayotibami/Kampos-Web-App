import type { ReactNode } from "react";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { resolveServerAuthState, isAdminAccount } from "@/lib/serverAuth";
import { isKingRole } from "@/lib/roles";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { AppShell } from "@/components/layout/AppShell";
import { VillagePeopleRail } from "@/components/villagepeople/VillagePeopleRail";
import { MobileNavBar } from "@/components/villagepeople/MobileNavBar";
import { VillagePeopleLoadingSkeleton } from "@/components/villagepeople/VillagePeopleLoadingSkeleton";

/**
 * The admin gate for the whole /villagepeople section — every page under
 * here (HQ, Admins, and whatever Group B/C add later) is unreachable to a
 * non-admin without ever rendering, same "redirect before any HTML ships"
 * approach gateServer() uses for the regular auth states. Admin status
 * isn't one of AuthGateState's four values though (it's a separate,
 * orthogonal axis — plenty of "active" accounts are role: 'user'), so this
 * calls resolveServerAuthState() directly and checks the account's role
 * itself rather than going through gateServer.
 *
 * "unknown" (backend temporarily unreachable) is treated as NOT admin here
 * — the opposite of gateServer's own choice to let "unknown" through. That
 * one exists so a Render cold-start blip doesn't spuriously log a regular
 * user out of a page they already had access to; this is an admin-only
 * section, where failing closed on an unverifiable session is the safer
 * default.
 *
 * Wrapped in its own local <Suspense> (not this route's loading.tsx) for
 * the same reason SettingsLayout's SettingsGate is — a segment's loading.tsx
 * never covers that same segment's own layout.tsx.
 */
async function VillagePeopleGate({ children }: { children: ReactNode }) {
  const { state, account, profiles } = await resolveServerAuthState();
  if (state === "unknown" || !isAdminAccount(account)) {
    redirect("/");
  }
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <MobileNavBar isKing={isKingRole(account?.role)} email={account?.email} />
        <VillagePeopleRail isKing={isKingRole(account?.role)} email={account?.email} />
        <div className="min-h-0 w-full flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

export default function VillagePeopleLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell variant="panel">
      <Suspense fallback={<VillagePeopleLoadingSkeleton />}>
        <VillagePeopleGate>{children}</VillagePeopleGate>
      </Suspense>
    </AppShell>
  );
}
