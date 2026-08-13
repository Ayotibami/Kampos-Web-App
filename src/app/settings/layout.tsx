import type { ReactNode } from "react";
import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { AppShell } from "@/components/layout/AppShell";
import { SettingsRail } from "@/components/settings/SettingsRail";

/**
 * Shared frame for every Settings page — the auth gate + AppShell that used
 * to be repeated in each page.tsx now live here once. On desktop this is
 * what makes Settings a real two-pane page: SettingsRail stays mounted
 * across navigation between /settings/profile, /settings/account, etc.
 * (a Next layout, unlike each page's own component tree, doesn't remount
 * on sibling navigation), so only the content pane (children) swaps.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const { state, account, profiles } = await gateServer(["active"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <AppShell variant="panel">
        <div className="flex min-h-0 flex-1 md:flex-row">
          <SettingsRail />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      </AppShell>
    </>
  );
}
