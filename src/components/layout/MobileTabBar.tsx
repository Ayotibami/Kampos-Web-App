"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MessageCircle, VideoTabIconFill } from "@/components/ui/icons";
import { useAuthStore } from "@/stores/authStore";
import { Avatar } from "@/components/ui/Avatar";
import { playSound } from "@/lib/sounds";

type TabId = "feed" | "video" | "profile";

// Every top-level static route — anything else single-segment (e.g.
// "/tobi_waves") is a profile, matching how [avitag]/page.tsx itself
// resolves as Next's catch-all for whatever isn't one of these. Used only
// to decide whether the CURRENT page is someone's profile, for the "You"
// tab's active state and to keep the bar visible while browsing profiles
// generally (not just your own) — mirrors the "light" route list the
// theme-init script in layout.tsx already keeps for the same reason.
const RESERVED_TOP_LEVEL = new Set([
  "feed", "spot", "settings", "villagepeople", "gist", "api",
  "login", "signup", "signup-success", "verify-otp",
  "forgot-password", "reset-password", "setup-profile", "welcome",
]);

function isProfileRoute(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length === 1 && !RESERVED_TOP_LEVEL.has(parts[0]);
}

/**
 * Bottom tab bar — mobile-only, second root-level surface alongside Gist.
 * Three stops: Gist (text), Spot (video), and You (profile) — Settings used
 * to be the third stop, swapped back out for Profile since that's the
 * pattern every major app actually uses (Instagram/TikTok/X all put Profile
 * on the bar and nest Settings inside it, never the other way around).
 * Route-gated like FeedScrollLock/ThemeRouteSync (renders null outside its
 * own routes) rather than mounted per-page, so /feed, /spot, and any
 * profile page share one instance and can never drift out of sync with
 * each other.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const avitag = useAuthStore((s) => s.avitag);
  const myImageUrl = useAuthStore(
    (s) => (s.profiles.find((p) => p.avitag === s.avitag)?.image_url as string | undefined) ?? null,
  );
  const onFeed = pathname === "/feed";
  const onVideo = pathname.startsWith("/spot");
  const onProfile = isProfileRoute(pathname);

  // Real navigation only ever confirms itself once `pathname` actually
  // changes — which can lag well behind the tap on a cold cache hit, since
  // it's a genuine network+render round trip. playSound("tap") has no such
  // floor (it's pure local playback), so without this, the tap sound was
  // the ONLY thing that happened at tap-time — the highlight pill sat
  // frozen on the old tab until navigation caught up, reading as "the
  // sound is out of sync" even though the sound itself was exactly on
  // time. This optimistically snaps the pill to the tapped tab in the
  // SAME handler as the sound (see onClick below), then clears itself the
  // moment the real pathname changes — reconciling automatically whether
  // that lands on the expected tab or somewhere else entirely (e.g. an
  // auth redirect).
  const [pendingTab, setPendingTab] = useState<TabId | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingTab(null);
  }, [pathname]);

  // Mirrors the reaction/poll-vote optimistic pattern elsewhere in the
  // app: tiny press-state set on pointerdown (not onClick — fires the
  // instant a finger touches down, before the browser even resolves a
  // full click) purely to drive a visible "I felt that" scale/opacity
  // punch. Kept separate from pendingTab because a press that never
  // completes as a tap (finger dragged off) should still visually
  // release, without implying a navigation was ever committed to.
  const [pressedTab, setPressedTab] = useState<TabId | null>(null);
  const press = (tab: TabId) => ({
    onPointerDown: () => setPressedTab(tab),
    onPointerUp: () => setPressedTab(null),
    onPointerLeave: () => setPressedTab(null),
    onPointerCancel: () => setPressedTab(null),
  });

  if (!onFeed && !onVideo && !onProfile) return null;

  const profileHref = avitag ? `/${avitag}` : "/feed";
  // Active only on YOUR OWN profile, not anyone else's — browsing someone
  // else's page shouldn't light up "You".
  const onOwnProfile = onProfile && !!avitag && pathname === `/${avitag}`;

  const activeTab: TabId | null =
    pendingTab ?? (onFeed ? "feed" : onVideo ? "video" : onOwnProfile ? "profile" : null);
  const isActive = {
    feed: activeTab === "feed",
    video: activeTab === "video",
    profile: activeTab === "profile",
  };
  const pressClass = (tab: TabId) =>
    pressedTab === tab ? "scale-90 opacity-70" : "scale-100 opacity-100";

  return (
    // Floating dock, not an edge-to-edge bar: 80% width, centered, lifted
    // off the bottom edge with real margin (the margin itself carries the
    // safe-area inset now, since the bar no longer touches the edge for
    // pb-safe-area to apply to) and rounded corners with a real shadow so
    // it reads as elevated above the content rather than docked to the
    // screen's own edge.
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-30 mx-auto flex w-[80%] items-center rounded-full border border-line/60 bg-surface/95 px-1.5 py-1.5 shadow-lg shadow-black/10 backdrop-blur-md md:hidden"
    >
      <Link
        href="/feed"
        aria-current={isActive.feed ? "page" : undefined}
        onClick={() => {
          if (onFeed) return;
          playSound("tap");
          setPendingTab("feed");
        }}
        {...press("feed")}
        className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 font-nunito text-[10.5px] font-bold transition ${pressClass("feed")} ${
          isActive.feed ? "bg-brand/10 text-brand" : "text-faint"
        }`}
      >
        <MessageCircle className="h-5 w-5" strokeWidth={isActive.feed ? 2.5 : 2} />
        Gist
      </Link>
      <Link
        href="/spot"
        aria-current={isActive.video ? "page" : undefined}
        onClick={() => {
          if (onVideo) return;
          playSound("tap");
          setPendingTab("video");
        }}
        {...press("video")}
        className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 font-nunito text-[10.5px] font-bold transition ${pressClass("video")} ${
          isActive.video ? "bg-brand/10 text-brand" : "text-faint"
        }`}
      >
        <VideoTabIconFill className="h-5 w-5" weight={isActive.video ? "fill" : "regular"} />
        Spot
      </Link>
      <Link
        href={profileHref}
        aria-current={isActive.profile ? "page" : undefined}
        onClick={() => {
          if (onOwnProfile) return;
          playSound("tap");
          setPendingTab("profile");
        }}
        {...press("profile")}
        className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 font-nunito text-[10.5px] font-bold transition ${pressClass("profile")} ${
          isActive.profile ? "bg-brand/10 text-brand" : "text-faint"
        }`}
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full ${
            isActive.profile ? "ring-2 ring-brand" : "ring-1 ring-faint/60"
          }`}
        >
          <Avatar src={myImageUrl} />
        </span>
        You
      </Link>
    </nav>
  );
}
