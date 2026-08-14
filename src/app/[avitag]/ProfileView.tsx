"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useAnimationControls } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ProfileGistCard } from "@/components/gist/ProfileGistCard";
import { ProfileGistCardSkeleton } from "@/components/gist/ProfileGistCardSkeleton";
import { CreateGistSheet } from "@/components/gist/CreateGistSheet";
import { CommentPanel } from "@/components/comment/CommentPanel";
import { CommentSheet } from "@/components/comment/CommentSheet";
import {
  ArrowLeft,
  Plus,
  X,
  SettingsIconFill,
  CampusIconFill,
  MajorIconFill,
  LevelIconFill,
} from "@/components/ui/icons";
import { useGistStore } from "@/stores/gistStore";
import { useAuthStore } from "@/stores/authStore";
import { apiErrorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useIsMobile } from "@/lib/useIsMobile";
import type { Gist, Profile } from "@/types";

const BOARD_TONE = {
  blue: "bg-[#dbe9fd] text-[#0e3e87]",
  gold: "bg-[#fff0c2] text-[#6b4f00]",
  mint: "bg-[#dcf7e3] text-[#1e5c33]",
} as const;

// The three info boards' one-time entrance ("jump" into place) and their
// recurring little re-bounce afterward, every BOUNCE_INTERVAL_MS — a small
// idle nudge to keep the pinboard feeling alive, not just a static entrance.
const JUMP_IN_SPRING = { type: "spring", stiffness: 380, damping: 14 } as const;
const REBOUNCE = {
  y: [0, -6, 0],
  scale: [1, 1.05, 1],
  transition: { duration: 0.45, ease: "easeOut" as const },
};
const BOUNCE_INTERVAL_MS = 30_000;
// The bio's flanking em-dashes only make sense as a one-line quote — past
// this length they'd sit oddly next to a wrapped paragraph, so longer bios
// drop them and read as a plain centered callout instead.
const BIO_DASH_MAX_CHARS = 60;
// A mix, not four of the same shape — previews the real variety a gist
// list actually has (short hero, plain long text, media) instead of
// reading as one block repeated.
const SKELETON_VARIANTS = ["media", "text", "hero", "text"] as const;
const LOAD_MORE_SKELETON_VARIANTS = ["text", "hero"] as const;

/** The short tag chip next to the display name (e.g. "UNILAG", "COMP-SCI") —
 * profile-page-only, deliberately simpler than GistCard's own CampusTag/
 * MajorTag/LevelTag (no sway animation, one uniform size). Colored to match
 * its corresponding InfoBoard below via the same BOARD_TONE, so the small
 * chip up top and the fuller card further down read as the same fact told
 * twice, not two unrelated pieces of UI. */
function ProfileTag({ tone, children }: { tone: keyof typeof BOARD_TONE; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 font-nunito text-[9px] font-bold uppercase tracking-wide md:text-[11px] ${BOARD_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** A small colored info card — same rounded-[32px] shape as a real gist
 * card, just tinted instead of white — for campus/major/level. Real full
 * names go here, not the short gist-card tags. The icon sits inline with
 * the label (not beside the value, not a corner watermark) — it's there to
 * reinforce what the row is about, same job the label already does. */
function InfoBoard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: keyof typeof BOARD_TONE;
}) {
  return (
    // Mobile sizing is deliberately its own scale, not a shrunk copy of
    // desktop's — fitting all three on one row (see the boards row below,
    // now flex-1 + no wrap on every breakpoint) needs a real floor much
    // lower than desktop's 200-240px cards, not just tighter padding.
    // md: fully re-specifies every one of these (min-h/min-w/max-w/p/
    // rounded), so desktop's own sizing is untouched either way.
    <div
      className={`flex min-h-[74px] w-full min-w-0 flex-col justify-center rounded-2xl p-2.5 shadow-[0_6px_12px_-4px_rgba(43,40,32,0.35)] md:min-h-[140px] md:min-w-[200px] md:max-w-[240px] md:rounded-[32px] md:p-6 ${BOARD_TONE[tone]}`}
    >
      <span className="flex items-center gap-1 opacity-60 md:gap-1.5">
        {icon}
        <span className="font-nunito text-[7px] font-semibold uppercase leading-tight md:text-sm md:tracking-wider">
          {label}
        </span>
      </span>
      <span className="mt-0.5 block break-words font-nunito text-[11px] font-bold leading-snug md:mt-2 md:text-2xl md:font-extrabold">
        {value}
      </span>
    </div>
  );
}

/** `CommentPanel` itself only ever shows a bare "X Comments" count — fine
 * on the gist page, where the gist it's about is the whole screen right
 * next to it, but not enough here, where the panel stays put while several
 * different gists scroll past on the left. This sits above it (not inside
 * CommentPanel itself, so its own look on the gist page is untouched) with
 * just enough of the active gist to make it obvious what's being commented
 * on without cross-referencing the list. */
function ActiveGistStrip({ gist, onClose }: { gist: Gist | undefined; onClose: () => void }) {
  if (!gist) return null;
  const text = gist.gist_text?.trim();
  const preview = text
    ? text.length > 90
      ? `${text.slice(0, 90).trimEnd()}…`
      : text
    : gist.media?.[0]?.media_type?.toLowerCase().includes("video")
      ? "Video"
      : gist.media?.length
        ? "Photo"
        : "";
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line bg-brand/[0.06] px-5 py-3 dark:border-white/10 dark:bg-brand-ink/60">
      <div className="min-w-0">
        <p className="font-nunito text-[10px] font-bold uppercase tracking-wide text-brand">Commenting on</p>
        <p className="mt-0.5 line-clamp-2 font-nunito text-xs text-ink dark:text-white/90">{preview}</p>
        <p className="mt-0.5 font-nunito text-[11px] text-faint">{timeAgo(gist.created_at)}</p>
      </div>
      {/* Closes the panel regardless of which card opened it — useful once
          you've scrolled away and the card whose button toggled it open
          isn't even on screen anymore. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close comments"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Full-size profile photo view — tap the avatar circle to open, tap
 * anywhere (backdrop or the photo itself) to close, same as tapping a
 * profile photo does everywhere else. Natural aspect ratio, capped to the
 * viewport, no cropping — unlike the small circle it's opened from, this
 * is the one place the whole photo is actually visible. */
function AvatarLightbox({ open, src, onClose }: { open: boolean; src: string; onClose: () => void }) {
  return (
    // Built on the shared Modal, not a hand-rolled fixed/backdrop div — it
    // already does the two things that actually matter here: locks the
    // real page scroll while open (document.body.style.overflow), and
    // portals to document.body so `position: fixed` resolves against the
    // true viewport instead of risking getting trapped inside some
    // ancestor's own transform (this page animates several elements with
    // Framer Motion, any of which becomes a new containing block for a
    // plain in-place `fixed` element). className overrides Modal's default
    // sizing entirely, since a photo should size to its own aspect ratio,
    // not a fixed dialog box.
    <Modal
      open={open}
      onClose={onClose}
      className="relative z-10 m-auto flex max-h-[90vh] max-w-[92vw] items-center justify-center"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
      >
        <X className="h-4 w-4" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onClick={onClose}
        className="max-h-[90vh] max-w-[92vw] cursor-pointer rounded-2xl object-contain"
      />
    </Modal>
  );
}

/**
 * The one page for viewing a profile — your own or anyone else's, same
 * component either way. `isOwnProfile` (resolved server-side in page.tsx,
 * comparing the route avitag against the signed-in viewer's own profiles
 * list) is the only thing that changes what renders: the Settings/theme
 * chrome only shows on your own profile. That's a UX choice, not a security
 * boundary — the underlying data here is fully public regardless, and every
 * mutating endpoint (change password, update profile, etc.) already
 * independently checks account ownership server-side.
 *
 * The gist list below renders ProfileGistCard, not GistCard — the feed's own
 * card is built to fill one fixed-height swipe-stack slot, which doesn't
 * translate to a plain vertical list where each row's height should just
 * follow its own content. See ProfileGistCard's own doc comment for how it
 * adapts the feed's look to that context.
 */
export function ProfileView({
  avitag,
  profile,
  isOwnProfile,
}: {
  avitag: string;
  profile: Profile;
  isOwnProfile: boolean;
}) {
  const router = useRouter();
  const byUser = useGistStore((s) => s.byUser);
  // Only meaningful when !isOwnProfile — the top-right slot's other job
  // (Settings/theme) is owner-only, so someone browsing a different profile
  // gets a one-tap way back to their own instead of that slot sitting empty.
  // `myAvitag` doubles as "is anyone actually logged in" — a guest gets
  // neither this nor the Settings/theme row.
  const myAvitag = useAuthStore((s) => s.avitag);
  const myImageUrl = useAuthStore(
    (s) => (s.profiles.find((p) => p.avitag === s.avitag)?.image_url as string | undefined) ?? null,
  );
  const [showCreate, setShowCreate] = useState(false);
  const [avatarLightboxOpen, setAvatarLightboxOpen] = useState(false);
  const [gists, setGists] = useState<Gist[]>([]);
  const [gistsError, setGistsError] = useState<string | null>(null);
  // Which avitag `gists`/`gistsError` actually reflect — lets "loading" be
  // derived instead of an explicit synchronous reset at the top of the
  // effect below (avoids double-rendering on every avitag switch), while
  // still correctly showing a loading state if this ever navigates from one
  // profile straight to another without a full remount.
  const [loadedAvitag, setLoadedAvitag] = useState<string | null>(null);
  const loadingGists = loadedAvitag !== avitag;
  // byUser defaults to a 20-gist page server-side (see gist.repo.ts's
  // listByUser) — without this, anyone with more than 20 gists just had
  // the rest silently unreachable, with no "load more" to page through
  // them. Same cursor pattern the main feed already uses (see
  // FeedContent's own loadMore): cursor = the last-seen gist's id,
  // `exhausted` stops asking once a page comes back empty.
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  // Separate from gistsError on purpose — that one gates the whole list
  // (nothing loaded at all); a failed load-more should leave the gists
  // already on screen alone, not blank the list out from under them.
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    byUser(avitag)
      .then((data) => {
        if (cancelled) return;
        setGists(data);
        setGistsError(null);
        setLoadedAvitag(avitag);
        setExhausted(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setGistsError(apiErrorMessage(err, "Failed to load gists"));
        setLoadedAvitag(avitag);
      });
    return () => {
      cancelled = true;
    };
  }, [avitag, byUser]);

  const loadMoreGists = useCallback(async () => {
    if (loadingMore || exhausted || gists.length === 0) return;
    const cursor = gists[gists.length - 1]?.gist_id;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const more = await byUser(avitag, { cursor });
      if (more.length) setGists((prev) => [...prev, ...more]);
      else setExhausted(true);
      setLoadMoreError(null);
    } catch (err) {
      setLoadMoreError(apiErrorMessage(err, "Failed to load more gists"));
    } finally {
      setLoadingMore(false);
    }
  }, [avitag, byUser, exhausted, gists, loadingMore]);

  // Auto-fetches the next page itself as the list scrolls near its end —
  // no "Load more" button. `rootMargin` fires this a bit before the
  // sentinel is actually on screen so the next page is ready by the time
  // anyone reaches it. `root: null` (viewport-relative, not the scroll
  // container specifically) still resolves correctly here even though the
  // real scrolling happens on this page's own ancestor div, not the
  // window — IntersectionObserver computes against the sentinel's actual
  // clipped/rendered position, which already accounts for that ancestor's
  // overflow regardless of which element root points at.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMoreGists();
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMoreGists]);

  // The list itself owns these gists, not any single card — ProfileGistCard
  // fires these after a real delete/edit succeeds so the list reflects it
  // immediately instead of waiting on a refetch.
  const handleGistDeleted = (gistId: string) => setGists((prev) => prev.filter((g) => g.gist_id !== gistId));
  const handleGistEdited = (fresh: Gist) =>
    setGists((prev) => prev.map((g) => (g.gist_id === fresh.gist_id ? fresh : g)));

  // Desktop only: which gist the sticky comment panel (below the gist list)
  // is currently showing — whichever card is nearest the vertical center of
  // the screen as the list scrolls. `rootMargin: "-50% 0px -50% 0px"` is the
  // standard "scrollspy" trick: it shrinks the observer's root down to a
  // single line across the exact middle of the viewport, so `isIntersecting`
  // only flips true for whichever card is currently crossing that line.
  // Defaults to the first gist once the list loads, so the panel isn't
  // empty before anyone's scrolled at all.
  const [activeGistId, setActiveGistId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  // Done during render (the documented React pattern for deriving state
  // from a prop/state change), not in an effect — the guard itself
  // (activeGistId === null) is what makes this safe to call unconditionally
  // here: it's only ever true before the very first gist has loaded, so it
  // fires exactly once and never again, no separate "did this already run"
  // tracking needed.
  if (activeGistId === null && gists.length > 0) {
    setActiveGistId(gists[0].gist_id);
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute("data-gist-id");
            if (id) setActiveGistId(id);
          }
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    cardRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // Re-observes whenever the list itself changes (pagination adding more
    // cards, or the list re-rendering with fresh refs) — cheap, and the
    // alternative (trying to diff which refs are "new") isn't worth it for
    // a handful of IntersectionObserver.observe() calls.
  }, [gists]);

  const activeGist = gists.find((g) => g.gist_id === activeGistId);

  // Closed by default — the panel used to always show once you scrolled
  // into the gist list, which meant permanently giving up 360px of width
  // even for someone just browsing. Now a card's own comment button (see
  // ProfileGistCard) is what opens it, and the gist list reclaims the full
  // width the moment it's closed (see the sticky column's own render
  // guard below, gated on this too).
  const [commentsOpen, setCommentsOpen] = useState(false);
  // Mobile has no sticky side panel (there's no room for one) — same
  // comment button instead opens CommentSheet, mirroring exactly how the
  // feed's own mobile icon+count trigger already works: it opens the
  // sheet, it doesn't toggle it shut again on a second tap (that's what
  // the sheet's own close button/backdrop are for).
  const isMobile = useIsMobile();
  const [showCommentSheet, setShowCommentSheet] = useState(false);
  const handleToggleComments = (gistId: string) => {
    setActiveGistId(gistId);
    if (isMobile) {
      setShowCommentSheet(true);
      return;
    }
    if (commentsOpen && activeGistId === gistId) {
      setCommentsOpen(false);
    } else {
      setCommentsOpen(true);
    }
  };

  // Imperative controls (not a plain `animate` object) specifically because
  // this component drives TWO different animations on the same element over
  // time — the one-time entrance, then the recurring re-bounce — and only
  // controls.start() lets a later call layer on top of wherever the value
  // currently sits, instead of the two fighting over one static target.
  const campusControls = useAnimationControls();
  const majorControls = useAnimationControls();
  const levelControls = useAnimationControls();

  useEffect(() => {
    // Staggered on the way in (each card jumps a beat after the last)...
    campusControls.start({ y: 0, opacity: 1, scale: 1, transition: { ...JUMP_IN_SPRING, delay: 0 } });
    majorControls.start({ y: 0, opacity: 1, scale: 1, transition: { ...JUMP_IN_SPRING, delay: 0.1 } });
    levelControls.start({ y: 0, opacity: 1, scale: 1, transition: { ...JUMP_IN_SPRING, delay: 0.2 } });

    // ...but the recurring re-bounce fires all three from the SAME interval
    // tick, so they bounce together rather than staggered again.
    const interval = setInterval(() => {
      campusControls.start(REBOUNCE);
      majorControls.start(REBOUNCE);
      levelControls.start(REBOUNCE);
    }, BOUNCE_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = String(profile.first_name ?? "");
  const lastName = String(profile.last_name ?? "");
  const bio = String(profile.bio ?? "");
  const imageUrl = (profile.image_url as string | null | undefined) ?? null;
  const level = profile.level as number | string | null | undefined;
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || avitag;
  // Plain full names for the info boards — falls back to the raw tag only
  // if the joined name is somehow missing, never shows the abbreviated tag
  // when the real name is available.
  const campusName =
    typeof profile.campus_name === "string"
      ? profile.campus_name
      : typeof profile.campus_tag === "string"
        ? profile.campus_tag
        : null;
  const majorName =
    typeof profile.major_name === "string"
      ? profile.major_name
      : typeof profile.major_tag === "string"
        ? profile.major_tag
        : null;
  // Raw short tags (not the full names above) — the same terse chips gist
  // posts already show next to a poster's name, reused here verbatim (see
  // GistTags.tsx) so a name is recognizable the same way in both places.
  const campusTag = typeof profile.campus_tag === "string" ? profile.campus_tag : null;
  const majorTag = typeof profile.major_tag === "string" ? profile.major_tag : null;

  return (
    <AppShell variant="panel">
      {/* AppShell's "panel" variant deliberately locks itself to exactly the
          viewport height on desktop (md:h-dvh md:overflow-hidden) and never
          scrolls on its own — same pattern SettingsPageShell already relies
          on, and needs the exact same fix here: THIS div, not the
          width-capped one below it, owns the actual scrolling, so the
          scrollbar renders at the real page edge instead of floating at the
          centered column's edge. Without it, content taller than the
          viewport was just clipped, with no way to reach anything past the
          fold on desktop. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Full-bleed on mobile (already narrow, nothing to gain from
            capping it) — but "panel" is otherwise an edge-to-edge desktop
            page with no side rail of its own here (unlike Settings, which
            legitimately fills the width with its two-pane layout), so on a
            wide monitor this column stretched thin and empty at the edges.
            Capped + centered from md up instead. */}
        {/* Full width now, not capped — the header/boards/bio still get
            their own centered md:max-w-6xl treatment just below, but the
            gist list + comment panel split further down needs to reach the
            TRUE viewport edge (same as the gist page's own comment panel
            does), which a shared cap on everything would have prevented. */}
        <div className="relative z-10 flex w-full flex-1 flex-col">
          {/* The doodle background lives HERE, as this wrapper's own first
              child, not as a sibling of the outer scrolling div — that was
              the original bug: sized via `absolute inset-0` against the
              SCROLL CONTAINER, its height locked to one viewport's worth
              (the scroll container's own visible height, not its scrollable
              content height), so it simply ran out before reaching anything
              below the fold. This wrapper, by contrast, grows with ALL of
              its content below (both the capped header section AND the
              full-width split section after it), so `inset-0` against IT
              spans the whole page regardless of which of its children are
              individually capped. `-z-10` (not the default auto) keeps it
              behind this wrapper's own plain in-flow children — a
              positioned sibling with z-index:auto would otherwise paint
              ABOVE ordinary in-flow content, not below it, per the normal
              CSS stacking order. The SVG's own paths are drawn at 8%
              fill-opacity internally — stacking a low wrapper opacity on
              top of that compounds to basically nothing; AppShell's
              "landscape" variant solves this the same way (wrapper opacity
              in the 45-55% range). */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 opacity-[0.5] dark:opacity-[0.4] dark:invert"
            style={{
              backgroundImage: "url('/brand/doodles.svg')",
              backgroundRepeat: "repeat",
              backgroundSize: "280px auto",
            }}
          />
        <div className="mx-auto flex w-full flex-1 flex-col md:max-w-6xl">
          {/* Header — a back arrow + the avitag as the page's own title, same
              "← Title" pattern Settings already uses. Always shown (unlike
              the settings/theme controls below, which only make sense on
              your own profile) — this is what fills the otherwise-empty top
              of the page when looking at someone else's profile, and gives
              everyone a way back that isn't just the browser's own button. */}
          <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.back()}
                aria-label="Back"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <span className="font-nunito text-lg font-extrabold text-ink md:text-xl">{avitag}</span>
            </div>

            {isOwnProfile ? (
              <div className="flex items-center gap-1.5">
                {/* Compose trigger — same brand-filled circle as the feed
                    header's own (see FeedContent.tsx), so posting reads as
                    one consistent affordance app-wide, not a feed-only
                    action. Only shown here because a gist posts as whichever
                    profile is active — that's always this one on your own
                    page, never true on someone else's. */}
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  aria-label="Create a gist"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm shadow-brand/30 transition hover:bg-brand-dark active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <Link
                  href="/settings"
                  aria-label="Settings"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
                >
                  <SettingsIconFill className="h-5 w-5" weight="regular" />
                </Link>
                <ThemeToggle />
              </div>
            ) : (
              myAvitag && (
                <Link
                  href={`/${myAvitag}`}
                  aria-label="Your profile"
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-line transition hover:ring-brand"
                >
                  <Avatar src={myImageUrl} />
                </Link>
              )
            )}
          </div>

        {/* Mobile: everything stacked and centered. Desktop: Pinboard's
            layout — avatar+name anchored far left and sized up, the info
            boards spanning the remaining width to its right, wrapping as
            needed. */}
        <div className="flex flex-col items-center gap-4 px-6 pb-6 pt-4 text-center md:flex-row md:items-start md:gap-10 md:px-12 md:pt-10 md:text-left">
          <div className="flex shrink-0 flex-col items-center gap-3 md:items-start">
            {/* Same ring treatment Profile Settings already uses for its own
                avatar — brand-filled outer ring, tinted inner circle. Tap
                opens it full-size, same as tapping a profile photo does
                everywhere else — only actually clickable when there's a
                real photo to enlarge, not the plain grey fallback circle. */}
            <button
              type="button"
              onClick={() => imageUrl && setAvatarLightboxOpen(true)}
              aria-label={imageUrl ? "View profile photo" : undefined}
              disabled={!imageUrl}
              className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand p-1.5 transition active:scale-95 disabled:active:scale-100 md:h-44 md:w-44 md:p-1"
            >
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-brand/10">
                <Avatar src={imageUrl} />
              </div>
            </button>

            <div>
              <p className="font-nunito text-lg font-bold text-ink md:text-2xl">{displayName}</p>
              <p className="font-nunito text-sm text-brand md:text-base">{avitag}</p>
              {(campusTag || majorTag || level != null) && (
                <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5 md:justify-start">
                  {campusTag && <ProfileTag tone="blue">{campusTag}</ProfileTag>}
                  {majorTag && <ProfileTag tone="gold">{majorTag}</ProfileTag>}
                  {level != null && <ProfileTag tone="mint">{level}</ProfileTag>}
                </div>
              )}
            </div>
          </div>

          {/* flex-1 on each card (mobile only; desktop keeps its own fixed
              min/max-w sizing via md:flex-none) splits the row evenly so all
              three fit on one line most of the time — but the rotation stays
              on every breakpoint, and a rotated card's corners can push past
              a strict single row on the narrowest phones, so this still
              wraps (flex-wrap, not nowrap) rather than clip/overlap when
              that happens. */}
          <div className="flex w-full flex-1 flex-wrap items-center justify-center gap-2 md:flex-nowrap md:justify-start md:gap-8 md:pt-3">
            {campusName && (
              <motion.div
                className="min-w-0 flex-1 md:flex-none"
                initial={{ y: 40, opacity: 0, scale: 0.5 }}
                animate={campusControls}
              >
                <div className="-rotate-3">
                  <InfoBoard
                    icon={<CampusIconFill className="h-3.5 w-3.5 md:h-4 md:w-4" weight="bold" />}
                    label="Campus"
                    value={campusName}
                    tone="blue"
                  />
                </div>
              </motion.div>
            )}
            {majorName && (
              <motion.div
                className="min-w-0 flex-1 md:flex-none"
                initial={{ y: 40, opacity: 0, scale: 0.5 }}
                animate={majorControls}
              >
                <div className="rotate-2">
                  <InfoBoard
                    icon={<MajorIconFill className="h-3.5 w-3.5 md:h-4 md:w-4" weight="bold" />}
                    label="Major"
                    value={majorName}
                    tone="gold"
                  />
                </div>
              </motion.div>
            )}
            {level != null && (
              <motion.div
                className="min-w-0 flex-1 md:flex-none"
                initial={{ y: 40, opacity: 0, scale: 0.5 }}
                animate={levelControls}
              >
                <div className="-rotate-2">
                  <InfoBoard
                    icon={<LevelIconFill className="h-3.5 w-3.5 md:h-4 md:w-4" weight="bold" />}
                    label="Level"
                    value={String(level)}
                    tone="mint"
                  />
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {bio && (
          <p className="mx-auto flex max-w-[420px] items-center justify-center gap-2.5 px-6 text-center md:max-w-[560px] md:px-12">
            {bio.length <= BIO_DASH_MAX_CHARS && (
              <span aria-hidden className="shrink-0 font-nunito text-sm font-bold text-line md:text-lg">
                —
              </span>
            )}
            <span className="font-nunito text-sm italic text-ink md:text-lg">{bio}</span>
            {bio.length <= BIO_DASH_MAX_CHARS && (
              <span aria-hidden className="shrink-0 font-nunito text-sm font-bold text-line md:text-lg">
                —
              </span>
            )}
          </p>
        )}
        </div>

        {/* Below the bio, the page splits into two columns on desktop —
            gists on the left, a sticky comment panel on the right, same
            component and width the gist page's own comment panel already
            uses. The split only starts HERE, not any higher up the page:
            scrolled up in the header/bio there's nothing to comment on yet,
            so nothing shows — that falls out naturally from the panel
            being `sticky`, not `fixed`. `md:items-stretch` (flex's own
            default, named explicitly since it's load-bearing here) makes
            the right column's OUTER wrapper match the LEFT column's full
            height, so the sticky panel nested inside it has real room to
            keep sticking for as long as the gist list keeps scrolling —
            the sticky panel itself stays a fixed one-viewport-tall box the
            whole time, not the tall outer wrapper around it. No gap between
            the two columns — CommentPanel already draws its own left
            border as the seam, matching the gist page exactly, where the
            panel sits flush against the true right edge of the screen. */}
        <div className="mt-8 md:mt-12 md:flex md:items-stretch">
          {/* justify-center + a capped inner block, not a flex-1 block that
              just stretches — same trick GistStack uses for its own card
              (max-w-[740px], centered in whatever width is actually left
              over next to the fixed comment column) so a gist card doesn't
              read any differently here than it does on the gist page. */}
          <div className="flex min-w-0 flex-1 justify-center px-4 pb-8 sm:px-6 md:px-12">
            <div className="w-full max-w-[740px]">
            {loadingGists ? (
              <ul className="flex flex-col gap-3">
                {SKELETON_VARIANTS.map((variant, i) => (
                  <li key={i}>
                    <ProfileGistCardSkeleton variant={variant} />
                  </li>
                ))}
              </ul>
            ) : gistsError ? (
              <p className="py-8 text-center font-nunito text-sm text-danger">{gistsError}</p>
            ) : gists.length === 0 ? (
              <p className="py-8 text-center font-nunito text-sm text-muted">No gists yet.</p>
            ) : (
              <>
                {/* Same "count + label" pattern CommentPanel already uses right
                    above its own list — a count means something specific
                    sitting next to what it's actually counting. */}
                <p className="mb-3 font-nunito text-base font-bold text-ink md:text-lg">
                  {gists.length} {gists.length === 1 ? "Gist" : "Gists"}
                </p>
                <ul className="flex flex-col gap-3">
                  {gists.map((g) => (
                    <li
                      key={g.gist_id}
                      data-gist-id={g.gist_id}
                      ref={(el) => {
                        if (el) cardRefs.current.set(g.gist_id, el);
                        else cardRefs.current.delete(g.gist_id);
                      }}
                    >
                      <ProfileGistCard
                        gist={g}
                        active={commentsOpen && g.gist_id === activeGistId}
                        onToggleComments={() => handleToggleComments(g.gist_id)}
                        onDeleted={handleGistDeleted}
                        onEdited={handleGistEdited}
                      />
                    </li>
                  ))}
                </ul>
                {/* Invisible trigger for the next page — see the
                    IntersectionObserver effect above. Not shown once
                    exhausted, so there's nothing left to ever re-trigger it. */}
                {!exhausted && <div ref={sentinelRef} aria-hidden className="h-1 w-full" />}
                {loadingMore && (
                  <ul className="mt-3 flex flex-col gap-3">
                    {LOAD_MORE_SKELETON_VARIANTS.map((variant, i) => (
                      <li key={i}>
                        <ProfileGistCardSkeleton variant={variant} />
                      </li>
                    ))}
                  </ul>
                )}
                {loadMoreError && (
                  <p className="py-4 text-center font-nunito text-xs text-danger">{loadMoreError}</p>
                )}
              </>
            )}
            </div>
          </div>

          {/* commentsOpen gates this whole column, not just the panel inside
              it — with only the left column left in the flex row, its own
              flex-1 + justify-center naturally reclaims the full width and
              recenters, no separate "closed" layout to maintain. */}
          {commentsOpen && !loadingGists && !gistsError && gists.length > 0 && (
            <div className="hidden md:block md:w-[360px] md:shrink-0">
              {/* bg-surface: CommentPanel's own background is a barely-there
                  4% brand tint — deliberately subtle, and fine on the gist
                  page where nothing sits behind it. Here the page's doodle
                  background scrolls past underneath this STICKY box as the
                  page moves, so without an opaque base of its own, that
                  moving doodle showed straight through the tint. */}
              <div className="sticky top-0 flex h-dvh flex-col bg-surface">
                <ActiveGistStrip gist={activeGist} onClose={() => setCommentsOpen(false)} />
                <div className="min-h-0 flex-1">
                  <CommentPanel gist={activeGist} />
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {isOwnProfile && (
        <CreateGistSheet
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onPosted={(fresh) => setGists((prev) => [fresh, ...prev])}
        />
      )}

      <CommentSheet
        open={showCommentSheet}
        onClose={() => setShowCommentSheet(false)}
        gist={activeGist}
        autoFocusInput={false}
      />

      {imageUrl && (
        <AvatarLightbox open={avatarLightboxOpen} src={imageUrl} onClose={() => setAvatarLightboxOpen(false)} />
      )}
    </AppShell>
  );
}
