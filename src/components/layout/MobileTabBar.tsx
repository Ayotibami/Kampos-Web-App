"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, VideoTabIconFill } from "@/components/ui/icons";
import { useAuthStore } from "@/stores/authStore";
import { Avatar } from "@/components/ui/Avatar";

// Every top-level static route — anything else single-segment (e.g.
// "/tobi_waves") is a profile, matching how [avitag]/page.tsx itself
// resolves as Next's catch-all for whatever isn't one of these. Used only
// to decide whether the CURRENT page is someone's profile, for the "You"
// tab's active state and to keep the bar visible while browsing profiles
// generally (not just your own) — mirrors the "light" route list the
// theme-init script in layout.tsx already keeps for the same reason.
const RESERVED_TOP_LEVEL = new Set([
  "feed", "video", "settings", "villagepeople", "gist", "api",
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
 * "Spot" is the settled name for the video tab; the route itself still
 * lives at /video.
 *
 * Route-gated like FeedScrollLock/ThemeRouteSync (renders null outside its
 * own routes) rather than mounted per-page, so /feed, /video, and any
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
  const onVideo = pathname.startsWith("/video");
  const onProfile = isProfileRoute(pathname);
  if (!onFeed && !onVideo && !onProfile) return null;

  const profileHref = avitag ? `/${avitag}` : "/feed";
  // Active only on YOUR OWN profile, not anyone else's — browsing someone
  // else's page shouldn't light up "You".
  const onOwnProfile = onProfile && !!avitag && pathname === `/${avitag}`;

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
        aria-current={onFeed ? "page" : undefined}
        className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 font-nunito text-[10.5px] font-bold transition ${
          onFeed ? "bg-brand/10 text-brand" : "text-faint"
        }`}
      >
        <MessageCircle className="h-5 w-5" strokeWidth={onFeed ? 2.5 : 2} />
        Gist
      </Link>
      <Link
        href="/video"
        aria-current={onVideo ? "page" : undefined}
        className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 font-nunito text-[10.5px] font-bold transition ${
          onVideo ? "bg-brand/10 text-brand" : "text-faint"
        }`}
      >
        <VideoTabIconFill className="h-5 w-5" weight={onVideo ? "fill" : "regular"} />
        Spot
      </Link>
      <Link
        href={profileHref}
        aria-current={onOwnProfile ? "page" : undefined}
        className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 font-nunito text-[10.5px] font-bold transition ${
          onOwnProfile ? "bg-brand/10 text-brand" : "text-faint"
        }`}
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full ${
            onOwnProfile ? "ring-2 ring-brand" : "ring-1 ring-faint/60"
          }`}
        >
          <Avatar src={myImageUrl} />
        </span>
        You
      </Link>
    </nav>
  );
}
