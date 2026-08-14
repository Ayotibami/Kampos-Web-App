"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useAnimationControls } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ProfileGistCard } from "@/components/gist/ProfileGistCard";
import { ProfileGistCardSkeleton } from "@/components/gist/ProfileGistCardSkeleton";
import { CreateGistSheet } from "@/components/gist/CreateGistSheet";
import {
  ArrowLeft,
  Plus,
  SettingsIconFill,
  CampusIconFill,
  MajorIconFill,
  LevelIconFill,
} from "@/components/ui/icons";
import { useGistStore } from "@/stores/gistStore";
import { useAuthStore } from "@/stores/authStore";
import { apiErrorMessage } from "@/lib/api";
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
        <div className="relative z-10 mx-auto flex w-full flex-1 flex-col md:max-w-6xl">
          {/* The doodle background lives HERE now, as this column's own
              first child, not as a sibling of the outer scrolling div — that
              was the bug: sized via `absolute inset-0` against the SCROLL
              CONTAINER, its height locked to one viewport's worth (the
              scroll container's own visible height, not its scrollable
              content height), so it simply ran out before reaching anything
              below the fold, including the gist list. This column, by
              contrast, grows with all of its own content (header through
              the last gist), so `inset-0` against IT spans the whole page.
              `-z-10` (not the default auto) keeps it behind this column's
              own plain in-flow children — a positioned sibling with
              z-index:auto would otherwise paint ABOVE ordinary in-flow
              content, not below it, per the normal CSS stacking order.
              The SVG's own paths are drawn at 8% fill-opacity internally —
              stacking a low wrapper opacity on top of that compounds to
              basically nothing; AppShell's "landscape" variant solves this
              the same way (wrapper opacity in the 45-55% range). */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 opacity-[0.5] dark:opacity-[0.4] dark:invert"
            style={{
              backgroundImage: "url('/brand/doodles.svg')",
              backgroundRepeat: "repeat",
              backgroundSize: "280px auto",
            }}
          />
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
                avatar — brand-filled outer ring, tinted inner circle. */}
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand p-1.5 md:h-44 md:w-44 md:p-1">
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-brand/10">
                <Avatar src={imageUrl} />
              </div>
            </div>

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

        {/* Narrower than the rest of the page on desktop (60% of this
            section's own available width, centered) — deliberately not
            full-bleed like the header/boards above it, so the doodle
            background (painted behind the whole page, see the layer at the
            top of this component) stays visible either side of the list
            instead of getting covered edge to edge. */}
        <div className="mt-8 flex-1 px-4 pb-8 sm:px-6 md:mt-12 md:w-[60%] md:mx-auto md:px-0">
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
                  <li key={g.gist_id}>
                    <ProfileGistCard gist={g} onDeleted={handleGistDeleted} onEdited={handleGistEdited} />
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
      </div>

      {isOwnProfile && (
        <CreateGistSheet
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onPosted={(fresh) => setGists((prev) => [fresh, ...prev])}
        />
      )}
    </AppShell>
  );
}
