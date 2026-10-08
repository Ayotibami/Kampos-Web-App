"use client";

import { useDesktopSidebarLayout } from "@/components/layout/useDesktopSidebarLayout";

/**
 * A flex sibling, not padding/margin on the content itself — DesktopSidebar
 * is `fixed`, so nothing about normal page flow naturally reserves space
 * for it, and every page it overlaps (feed, Spot, profile pages, Settings)
 * would otherwise render its own back arrow/avitag/title partly or fully
 * underneath it. Rendered once inside AppShell (gated to the "feed" and
 * "panel" variants — see AppShell.tsx), not per-page, so no individual
 * page has to remember to account for the sidebar itself. Width mirrors
 * DesktopSidebar's own exactly via the shared useDesktopSidebarLayout hook
 * (w-20 collapsed, w-52 expanded on feed with its comment panel closed) —
 * see that hook's own doc comment for why they have to share one source of
 * truth instead of each computing this independently.
 */
export function DesktopSidebarSpacer() {
  const { visible, expanded } = useDesktopSidebarLayout();
  if (!visible) return null;
  return <div aria-hidden className={`hidden shrink-0 transition-[width] duration-200 md:block ${expanded ? "md:w-52" : "md:w-20"}`} />;
}
