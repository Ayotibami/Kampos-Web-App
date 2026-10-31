"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { pickRandomPrompt } from "@/lib/composePrompts";

const CreateGistSheet = dynamic(
  () => import("@/components/gist/CreateGistSheet").then((m) => m.CreateGistSheet),
  { ssr: false },
);

/**
 * The Create Gist sheet as its own real route — reached from a
 * notification (ACTIVATION_NUDGE) that has nowhere else to land. Same
 * "open the modal" argument Hot already settled, specifically for the
 * case where there's no page already open to borrow: before this route
 * existed, "post something" meant navigating to /feed, waiting for IT to
 * mount, then letting an effect there notice a ?compose=1 query param and
 * flip local state — visibly landing on the feed first before the sheet
 * popped open on top of it.
 *
 * Deliberately NOT how the "+" buttons on Feed/Profile work, and that's
 * intentional, not an oversight: those already have a real list on screen
 * to splice a freshly-posted gist into instantly (see FeedContent's own
 * onPosted — it inserts the new gist right where you were looking,
 * no refetch, no lost scroll position). Routing THEM through this page
 * too would trade that optimistic insert for a full navigate-away-then-
 * back round trip, a straight regression for the one case that already
 * works well. This route exists only for entry points with no such list
 * to protect — today just the notification, perhaps a future share link
 * later — where there was never anything to splice into in the first
 * place, so navigating to /feed afterward costs nothing a fresh fetch
 * wouldn't already have to do anyway.
 *
 * The sheet's own look (bottom sheet, slide up, rounded top corners) is
 * untouched — Modal's own `variant="sheet"` already paints a full-bleed
 * dim/blur backdrop over whatever's behind it, so this page needs no
 * special styling of its own beyond a plain background to avoid a flash
 * of unstyled content before that backdrop paints.
 */
export function ComposePageContent() {
  const router = useRouter();
  // Picked once per mount, not on every render — CreateGistSheet runs its
  // own typing animation against this value and expects it to stay put
  // while open, same as FeedContent's own composePlaceholder (set once,
  // the moment the sheet opens, never recomputed while it's showing).
  const [placeholder] = useState(pickRandomPrompt);
  // CreateGistSheet calls onPosted() then immediately onClose() as part of
  // its own "close the sheet now that posting succeeded" bookkeeping — not
  // a genuine cancel. Without this flag, onClose's router.back() fires
  // right behind onPosted's router.push("/feed") in the same tick and
  // clobbers it (confirmed live: posting landed back on whatever page the
  // notification was tapped from, never /feed). A manual close (the X, or
  // backdrop tap) never touches `posted`, so router.back() still runs for
  // every real cancel.
  const postedRef = useRef(false);
  return (
    <div className="h-dvh w-full bg-surface">
      <CreateGistSheet
        open
        onClose={() => {
          if (!postedRef.current) router.back();
        }}
        onPosted={() => {
          postedRef.current = true;
          router.push("/feed");
        }}
        placeholder={placeholder}
      />
    </div>
  );
}
