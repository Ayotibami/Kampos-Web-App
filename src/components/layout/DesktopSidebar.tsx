"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageCircle, VideoTabIconFill, SettingsIconFill, SunIconFill, MoonIconFill } from "@/components/ui/icons";
import { useAuthStore } from "@/stores/authStore";
import { useThemeStore } from "@/stores/themeStore";
import { Avatar } from "@/components/ui/Avatar";
import { useDesktopSidebarLayout } from "@/components/layout/useDesktopSidebarLayout";
import { playSound } from "@/lib/sounds";

/**
 * Desktop's own equivalent of MobileTabBar — desktop had no way at all to
 * reach Gist/Spot once the mobile pill bar went `md:hidden`, only a bare
 * profile-avatar link in the feed header (see FeedContent.tsx's own
 * comment on that). Flush left edge, full viewport height, border-r like
 * the header's own border-b — a real docked panel that's part of the
 * page, not a floating card on top of it. The link block itself stays
 * compact and vertically centered rather than stretched to fill that
 * height — a short icon list pinned to the top of a tall empty column
 * reads sparse; dead-centered reads intentional.
 *
 * Width isn't fixed, but expansion is scoped to the feed page alone: when
 * its desktop comment panel is open (the common case — it defaults open
 * on desktop, see FeedContent.tsx), there isn't spare width for labels,
 * so the rail stays icon-only with a hover tooltip. The moment that panel
 * closes, the rail expands and shows each label inline instead, since the
 * room is actually there. Every OTHER page (Spot, a profile, Settings)
 * has no such panel at all and always stays collapsed — expansion isn't
 * "no panel = free space," it's "the one specific panel that exists is
 * closed." See layoutStore.ts for how FeedContent reports that panel's
 * state across to this component, which lives outside it.
 */
function RailItem({
  href,
  label,
  active,
  expanded,
  onClick,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  expanded: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`group relative flex h-11 items-center gap-3 overflow-hidden rounded-2xl transition-colors ${
        expanded ? "w-full px-3" : "w-11 justify-center"
      } ${active ? "bg-brand/10 text-brand" : "text-muted hover:bg-line/40 hover:text-ink"}`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{children}</span>
      {expanded ? (
        <span className="whitespace-nowrap font-nunito text-[14px] font-bold">{label}</span>
      ) : (
        // Tooltip — absolutely positioned, never affects the rail's own
        // width, so hovering never shifts layout or page content. Only
        // needed in icon-only mode; expanded mode already shows the label.
        <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg bg-brand-ink px-2.5 py-1.5 font-nunito text-xs font-bold text-white opacity-0 shadow-lg transition group-hover:opacity-100">
          {label}
        </span>
      )}
    </Link>
  );
}

// Same shell as RailItem (icon-only + tooltip vs icon+label), but a
// button driving useThemeStore's toggle instead of a Link — themeStore's
// own doc comment confirms dark mode only ever actually applies on this
// exact set of surfaces (feed/profile/settings), the same ones this rail
// already gates itself to, so there's no page it'd show on where toggling
// would be a no-op. Mounted-guard mirrors ThemeToggle.tsx's own reasoning:
// the real theme is only knowable client-side, so render a neutral icon
// until mounted rather than risk a hydration mismatch.
function RailThemeToggle({ expanded }: { expanded: boolean }) {
  const { theme, toggle } = useThemeStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && theme === "dark";
  const label = isDark ? "Light mode" : "Dark mode";

  return (
    <button
      type="button"
      onClick={() => {
        playSound("tap");
        toggle();
      }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`group relative flex h-11 items-center gap-3 overflow-hidden rounded-2xl text-muted transition-colors hover:bg-line/40 hover:text-ink ${
        expanded ? "w-full px-3" : "w-11 justify-center"
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        {isDark ? <SunIconFill className="h-5 w-5" weight="regular" /> : <MoonIconFill className="h-5 w-5" weight="regular" />}
      </span>
      {expanded ? (
        <span className="whitespace-nowrap font-nunito text-[14px] font-bold">{label}</span>
      ) : (
        <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg bg-brand-ink px-2.5 py-1.5 font-nunito text-xs font-bold text-white opacity-0 shadow-lg transition group-hover:opacity-100">
          {label}
        </span>
      )}
    </button>
  );
}

export function DesktopSidebar() {
  const avitag = useAuthStore((s) => s.avitag);
  const myImageUrl = useAuthStore(
    (s) => (s.profiles.find((p) => p.avitag === s.avitag)?.image_url as string | undefined) ?? null,
  );
  const { pathname, visible, expanded, onFeed, onVideo, onProfile, onSettings } = useDesktopSidebarLayout();

  if (!visible) return null;

  const profileHref = avitag ? `/${avitag}` : "/feed";
  const onOwnProfile = onProfile && !!avitag && pathname === `/${avitag}`;

  const tap = (already: boolean) => () => {
    if (!already) playSound("tap");
  };

  return (
    <nav
      aria-label="Primary"
      className={`fixed inset-y-0 left-0 z-20 hidden items-center border-r border-line bg-surface transition-[width] duration-200 md:flex ${
        expanded ? "w-52" : "w-20"
      }`}
    >
      <div className="flex w-full flex-col items-center gap-1 px-4">
        <RailItem href="/feed" label="Gist" active={onFeed} expanded={expanded} onClick={tap(onFeed)}>
          <MessageCircle className="h-5 w-5" strokeWidth={onFeed ? 2.5 : 2} />
        </RailItem>
        <RailItem href="/spot" label="Spot" active={onVideo} expanded={expanded} onClick={tap(onVideo)}>
          <VideoTabIconFill className="h-5 w-5" weight={onVideo ? "fill" : "regular"} />
        </RailItem>
        <RailItem href={profileHref} label="You" active={onOwnProfile} expanded={expanded} onClick={tap(onOwnProfile)}>
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full ${onOwnProfile ? "ring-2 ring-brand" : "ring-1 ring-faint/60"}`}>
            <Avatar src={myImageUrl} />
          </span>
        </RailItem>

        <div className={`my-1.5 h-px bg-line ${expanded ? "w-full" : "w-8"}`} />

        <RailItem href="/settings" label="Settings" active={onSettings} expanded={expanded} onClick={tap(onSettings)}>
          <SettingsIconFill className="h-5 w-5" weight={onSettings ? "fill" : "regular"} />
        </RailItem>
        <RailThemeToggle expanded={expanded} />
      </div>
    </nav>
  );
}
