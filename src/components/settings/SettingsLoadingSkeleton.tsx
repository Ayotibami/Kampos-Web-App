"use client";

import {
  ProfileIconFill,
  AccountIconFill,
  LegalIconFill,
  SupportIconFill,
} from "@/components/ui/icons";

const NAV_ITEMS = [
  { label: "Profile", icon: ProfileIconFill },
  { label: "Account", icon: AccountIconFill },
  { label: "Legal", icon: LegalIconFill },
  { label: "Support", icon: SupportIconFill },
] as const;

/**
 * Fallback for SettingsLayout's own auth check — the one place in the app
 * where the gateServer() call lives in layout.tsx rather than page.tsx (see
 * that file's own comment for why: a shared gate for every Settings page,
 * not repeated five times). A route's loading.tsx does NOT cover its own
 * segment's layout.tsx, only page.tsx and anything nested below — so this
 * has to be a local <Suspense> fallback inside the layout itself, not a
 * file-convention loading.tsx, or it never actually shows and navigation
 * just falls through to the root's loading screen instead.
 *
 * Mirrors SettingsRail's real desktop nav list — same icons/labels (static
 * content, not fetched, so there's nothing stopping this from being exact)
 * with none highlighted, since which sub-page is being entered isn't known
 * yet. Mobile shows the same row shapes SettingsHub uses.
 */
export function SettingsLoadingSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 md:flex-row">
      <nav className="hidden w-64 shrink-0 flex-col border-r border-line/70 p-6 md:flex">
        <div className="mb-6 flex animate-pulse items-center gap-2.5">
          <div className="h-9 w-9 shrink-0 rounded-full bg-line/40" />
          <div className="h-5 w-24 rounded-full bg-line/50" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 font-nunito text-sm font-medium text-ink">
              <item.icon className="h-4.5 w-4.5 shrink-0" weight="regular" />
              {item.label}
            </div>
          ))}
        </div>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col p-6">
        <div className="flex flex-col gap-3 animate-pulse">
          {NAV_ITEMS.map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-line/60 p-4">
              <item.icon className="h-5 w-5 shrink-0 text-muted" weight="regular" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded-full bg-line/50" />
                <div className="h-2.5 w-2/3 rounded-full bg-line/30" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
