"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, VideoTabIconFill } from "@/components/ui/icons";

/**
 * Bottom tab bar — mobile-only, second root-level surface alongside Gist.
 * Two stops: Gist (text) and Peep (video) — "Peep" is the settled name for
 * the video tab; the route itself still lives at /video (a URL rename is a
 * separate, bigger change from just relabeling the tab).
 *
 * Route-gated like FeedScrollLock/ThemeRouteSync (renders null outside its
 * own routes) rather than mounted per-page, so /feed and /video share one
 * instance and can never drift out of sync with each other.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const onFeed = pathname === "/feed";
  const onVideo = pathname.startsWith("/video");
  if (!onFeed && !onVideo) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md md:hidden"
    >
      <Link
        href="/feed"
        aria-current={onFeed ? "page" : undefined}
        className={`flex flex-1 flex-col items-center gap-1 py-2.5 font-nunito text-[11px] font-bold transition ${
          onFeed ? "text-brand" : "text-faint"
        }`}
      >
        <MessageCircle className="h-5 w-5" strokeWidth={onFeed ? 2.5 : 2} />
        Gist
      </Link>
      <Link
        href="/video"
        aria-current={onVideo ? "page" : undefined}
        className={`flex flex-1 flex-col items-center gap-1 py-2.5 font-nunito text-[11px] font-bold transition ${
          onVideo ? "text-brand" : "text-faint"
        }`}
      >
        <VideoTabIconFill className="h-5 w-5" weight={onVideo ? "fill" : "regular"} />
        Peep
      </Link>
    </nav>
  );
}
