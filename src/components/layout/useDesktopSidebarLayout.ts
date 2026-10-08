"use client";

import { usePathname } from "next/navigation";
import { useLayoutStore } from "@/stores/layoutStore";
import { isProfileRoute } from "@/components/layout/MobileTabBar";

/**
 * Single source of truth for DesktopSidebar's own route-gating and width —
 * shared with DesktopSidebarSpacer so the two can never drift out of sync.
 * A spacer that computed this independently could easily end up reserving
 * a different width than the sidebar actually renders at (e.g. one of them
 * missing the feed-expanded case), which would either leave a gap or let
 * content sit partly under the sidebar again — exactly the bug class this
 * whole thing exists to prevent.
 */
export function useDesktopSidebarLayout() {
  const pathname = usePathname();
  const commentsPanelOpen = useLayoutStore((s) => s.desktopCommentsPanelOpen);

  const onFeed = pathname === "/feed";
  const onVideo = pathname.startsWith("/spot");
  const onProfile = isProfileRoute(pathname);
  const onSettings = pathname.startsWith("/settings");
  const visible = onFeed || onVideo || onProfile || onSettings;
  // See DesktopSidebar's own doc comment for why this is feed-only.
  const expanded = onFeed && !commentsPanelOpen;

  return { pathname, visible, expanded, onFeed, onVideo, onProfile, onSettings };
}
