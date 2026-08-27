import type { ReactNode } from "react";
import { Suspense } from "react";
import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { AppShell } from "@/components/layout/AppShell";
import { SettingsRail } from "@/components/settings/SettingsRail";
import { SettingsLoadingSkeleton } from "@/components/settings/SettingsLoadingSkeleton";

/**
 * Shared frame for every Settings page — the auth gate + AppShell that used
 * to be repeated in each page.tsx now live here once. On desktop this is
 * what makes Settings a real two-pane page: SettingsRail stays mounted
 * across navigation between /settings/profile, /settings/account, etc.
 * (a Next layout, unlike each page's own component tree, doesn't remount
 * on sibling navigation), so only the content pane (children) swaps.
 *
 * The gateServer() call is wrapped in its own local <Suspense> rather than
 * relying on this route's loading.tsx — a segment's loading.tsx covers its
 * page.tsx and anything nested below, but NOT that same segment's own
 * layout.tsx (see Next's loading.js docs). Since this is the one place in
 * the app where the auth gate lives in a layout instead of a page, without
 * this it would fall through to the ROOT's loading screen instead of
 * Settings' own — exactly the bug this replaced (the blue Kampos splash
 * screen appearing for Settings instead of the settings-shaped skeleton).
 */
async function SettingsGate({ children }: { children: ReactNode }) {
  const { state, account, profiles } = await gateServer(["active"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <div className="flex min-h-0 flex-1 md:flex-row">
        <SettingsRail />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </>
  );
}

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell variant="panel">
      <Suspense fallback={<SettingsLoadingSkeleton />}>
        <SettingsGate>{children}</SettingsGate>
      </Suspense>
    </AppShell>
  );
}
