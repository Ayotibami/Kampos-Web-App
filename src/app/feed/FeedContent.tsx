"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { GistStack } from "@/components/gist/GistStack";
import { GistCardSkeleton } from "@/components/gist/GistCardSkeleton";
import { CreateGistSheet } from "@/components/gist/CreateGistSheet";
import { CommentPanel } from "@/components/comment/CommentPanel";
import { CommentSheet } from "@/components/comment/CommentSheet";
import { Illustration } from "@/components/brand/illustrations";
import { Avatar } from "@/components/ui/Avatar";
import { Wordmark } from "@/components/brand/Wordmark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SettingsIconFill, Plus, RefreshCw, CommentIconFill } from "@/components/ui/icons";
import { AnimatePresence } from "framer-motion";
import { useGistStore } from "@/stores/gistStore";
import { useCommentStore } from "@/stores/commentStore";
import { useAuthStore } from "@/stores/authStore";
import { compactNumber } from "@/lib/format";
import type { Gist } from "@/types";

type Tab = "Gist" | "Amebo";

// Compose-trigger animation timing. The "notice me" pulse used to run on its
// own faster interval, independent of the prompt text changing — now it
// fires exactly when the text does, once per PROMPT_ROTATE_MS, so the two
// read as one event (new prompt landing) instead of two unrelated ones.
const PROMPT_PULSE_MS = 550; // how long each flash lasts
const PROMPT_ROTATE_MS = 60_000; // how often the prompt text changes (and the pulse fires)
const PROMPT_FADE_MS = 250;
const PROMPT_TYPE_SPEED_MS = 50;

const PROMPTS = [
  'Oya gist us',
  'Feel free to rant',
  'Wetin dey your mind?',
  'Give us hot gist',
  'Wetin dey sup',
  'Oya we are listening',
  'Yarn some matter for us',
  "What's happening on campus?",
  'Tell us a story',
  'Any random gist?',
  'Any departmental gist',
  'Wetin dey sup for school',
  'Oya banter anybody!'
];

export function FeedContent() {
  const listGists = useGistStore((s) => s.list);
  const prefetchComments = useCommentStore((s) => s.prefetchBatch);
  const avitag = useAuthStore((s) => s.avitag);
  const myImageUrl = useAuthStore(
    (s) => (s.profiles.find((p) => p.avitag === s.avitag)?.image_url as string | undefined) ?? null
  );

  const [gists, setGists] = useState<Gist[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinct from a genuinely empty feed — an empty list because the fetch
  // itself failed (backend down, network hiccup) needs its own "something
  // went wrong, retry" UI, not the same "be the first to gist" copy a truly
  // empty feed shows. Conflating the two used to show "no gist dey here
  // yet" even when the database plainly had gists, purely because the one
  // fetch that happened to run failed.
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Sample/demo data has no real backend cursor to page through — pagination
  // only makes sense once the live API actually returned something.
  // Once the backend's cursor pagination genuinely runs out (an empty page
  // back), stop asking — otherwise sitting near the end of the feed would
  // keep re-firing the same exhausted request indefinitely (loadMore's own
  // identity changes each time loadingMore toggles, which re-triggers
  // GistStack's near-end effect even though nothing about the list moved).
  const [exhausted, setExhausted] = useState(false);
  const [tab, setTab] = useState<Tab>("Gist");
  const [current, setCurrent] = useState<Gist>();
  const [showCreate, setShowCreate] = useState(false);
  const [showCommentSheet, setShowCommentSheet] = useState(false);
  // The icon+count trigger just opens the sheet to look — it shouldn't pop
  // the keyboard open. The pill trigger is the one meant for typing, so
  // that one still autofocuses. Tracked per-open rather than hardcoded on
  // CommentSheet since the same sheet now has two different doors in.
  const [commentSheetAutoFocus, setCommentSheetAutoFocus] = useState(true);
  // Snapshotted at click time (not the live promptText) — the trigger's
  // rotating prompt keeps typing/swapping in the background while the
  // modal is open, so the placeholder has to freeze to whatever was showing
  // the moment someone actually clicked, not keep changing under them.
  const [composePlaceholder, setComposePlaceholder] = useState("");
  const [promptText, setPromptText] = useState("");
  const [promptPulse, setPromptPulse] = useState(false);
  const [promptFading, setPromptFading] = useState(false);
  const [avatarPing, setAvatarPing] = useState(0);
  const lastPromptIndex = useRef(-1);
  // The full sentence the typing animation is currently working toward —
  // kept separate from `promptText` (which is only ever the so-far-typed
  // prefix) so a click mid-type can snapshot the complete prompt instead of
  // whatever fragment happened to be on screen at that instant.
  const currentFullPromptRef = useRef("");
  const [showComposeHint, setShowComposeHint] = useState(false);

  const dismissComposeHint = () => {
    setShowComposeHint(false);
    try {
      window.localStorage.setItem("kampos-compose-hint-seen", "true");
    } catch {
      /* best-effort */
    }
  };

  // One-time coach mark teaching that the compose row is tappable — same
  // pattern as the swipe hint: shown once ever (localStorage-flagged), and
  // dismissed the moment someone actually opens the composer, or after a
  // short timeout either way (this one's a discovery aid, not essential, so
  // it doesn't need to block on a real interaction like the swipe hint does).
  useEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem("kampos-compose-hint-seen") === "true";
    } catch {
      /* storage unavailable — just don't show the hint */
    }
    if (seen) return;
    setShowComposeHint(true);
    const timer = window.setTimeout(() => dismissComposeHint(), 5000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Prompt rotation + attention pulse — a single loop now, on purpose: the
   * pulse (text flash + avatar ping) fires exactly when a new prompt lands,
   * every PROMPT_ROTATE_MS, instead of on its own faster independent timer.
   * Reads as one event ("a new prompt just arrived") rather than two
   * unrelated animations that happened to overlap sometimes.
   */
  useEffect(() => {
    let cancelled = false;
    let typingTimers: number[] = [];
    const afterTyping = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      typingTimers.push(id);
    };
    const clearTypingTimers = () => {
      typingTimers.forEach((id) => window.clearTimeout(id));
      typingTimers = [];
    };

    const nextPrompt = (): string => {
      let idx = Math.floor(Math.random() * PROMPTS.length);
      if (PROMPTS.length > 1) {
        while (idx === lastPromptIndex.current) {
          idx = Math.floor(Math.random() * PROMPTS.length);
        }
      }
      lastPromptIndex.current = idx;
      return PROMPTS[idx];
    };

    const typeIn = (text: string, onDone: () => void) => {
      currentFullPromptRef.current = text;
      clearTypingTimers();
      setPromptText("");
      let i = 0;
      const tick = () => {
        if (cancelled) return;
        i++;
        setPromptText(text.slice(0, i));
        if (i < text.length) afterTyping(tick, PROMPT_TYPE_SPEED_MS);
        else onDone();
      };
      afterTyping(tick, PROMPT_TYPE_SPEED_MS);
    };

    // Only on an actual rotation (not the very first prompt on mount) — a
    // fresh page load doesn't need a "notice me" flash for content that was
    // never there a moment ago to change from.
    const firePulse = () => {
      setPromptPulse(true);
      setAvatarPing((n) => n + 1);
      afterTyping(() => setPromptPulse(false), PROMPT_PULSE_MS);
    };

    const swap = () => {
      setPromptFading(true);
      afterTyping(() => {
        setPromptFading(false);
        typeIn(nextPrompt(), () => {});
        firePulse();
      }, PROMPT_FADE_MS);
    };

    typeIn(nextPrompt(), () => {});
    const rotateInterval = window.setInterval(swap, PROMPT_ROTATE_MS);

    return () => {
      cancelled = true;
      clearTypingTimers();
      window.clearInterval(rotateInterval);
    };
  }, [avitag]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listGists();
      setGists(data);
      setExhausted(false);
      setLoadError(false);
      void prefetchComments(data.map((g) => g.gist_id));
    } catch {
      // Backend unreachable/request failed — leave whatever gists were
      // already loaded in place (don't wipe a working feed over a single
      // failed refresh) but flag it so an empty list renders as "failed to
      // load, retry" instead of silently passing for "no gists exist".
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [listGists, prefetchComments]);

  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted || gists.length === 0) return;
    const cursor = gists[gists.length - 1]?.gist_id;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const more = await listGists({ cursor });
      if (more.length) {
        setGists((prev) => [...prev, ...more]);
        void prefetchComments(more.map((g) => g.gist_id));
      } else {
        // Cursor pagination genuinely ran out — stop asking. Without this,
        // sitting near the end of the feed re-fires this exact request
        // indefinitely: loadMore's own identity changes every time
        // loadingMore toggles, which re-triggers GistStack's near-end
        // effect even though the list itself never moves.
        setExhausted(true);
      }
    } catch {
      /* best-effort — the near-end trigger will just fire again on the next approach */
    } finally {
      setLoadingMore(false);
    }
  }, [exhausted, gists, listGists, loadingMore, prefetchComments]);

  useEffect(() => {
    void load();
  }, [load]);

  // YouTube-style chip row: each filter is its own independent pill (not a
  // shared sliding-indicator track), so adding a 3rd, 6th, or 10th tab later
  // (My Major, Kreators, Trending, ...) is just another chip in the scroll —
  // the pattern doesn't strain or need rethinking as the set grows, unlike a
  // segmented control which only really reads well at 2-3 items.
  const tabButtons = (["Gist", "Amebo"] as Tab[]).map((t) => {
    const isActive = tab === t;
    return (
      <button
        key={t}
        type="button"
        onClick={() => setTab(t)}
        className={`shrink-0 rounded-full px-4 py-1.5 font-poppins text-[14px] transition ${
          isActive
            ? "bg-brand text-white font-semibold shadow-sm shadow-brand/30"
            : "bg-brand/[0.06] text-faint font-medium hover:bg-brand/10 hover:text-brand"
        }`}
      >
        {t}
      </button>
    );
  });

  return (
    <AppShell variant="feed">
      <div className="flex h-dvh w-full overflow-hidden">
        {/* Center Feed */}
        <div className="relative flex h-full flex-1 flex-col bg-brand/[0.04] dark:bg-brand/[0.07]">
          {/* Header — logo + account icons on their own row (app chrome);
              feed tabs get their own row underneath (X-style: "which feed am
              I looking at" reads as content, not global nav), left-aligned
              so it has room to grow rightward as more filters get added. */}
          <header className="sticky top-0 z-10 w-full shrink-0 border-b border-line bg-surface/85 backdrop-blur-md">
            <div className="mx-auto flex max-w-[740px] items-center justify-between px-4 py-2 sm:px-6 md:py-2.5">
              <Wordmark accentClassName="text-brand" className="text-lg sm:text-xl" />

              <div className="flex items-center justify-end gap-1.5 sm:gap-2.5">
                <Link
                  href="/settings"
                  aria-label="Settings"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-brand/10 hover:text-brand"
                >
                  <SettingsIconFill className="h-5 w-5" weight="regular" />
                </Link>
                <ThemeToggle />
                <Link
                  href="/profile"
                  aria-label="Your profile"
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-line transition hover:ring-brand"
                >
                  <Avatar src={myImageUrl} />
                </Link>
              </div>
            </div>

            <div className="mx-auto max-w-[740px] overflow-x-auto px-4 pb-2.5 pt-1 no-scrollbar sm:px-6">
              <div className="inline-flex items-center gap-2">{tabButtons}</div>
            </div>
          </header>

          {/* Feed body — doodle tiled across the whole area behind the compose
              trigger + card (never in the header/navbar). Tiled rather than
              stretched: the source art is a tall 360×800 scattered doodle, not
              a seamless single-image cover, so tiling is what lets it genuinely
              fill a wide area without cropping most of it away. */}
          <div className="relative flex min-h-0 flex-1 flex-col items-center pb-0 pt-3 sm:pt-4 md:pb-6">
            <div
              aria-hidden
              // The SVG bakes in its own 8% fill-opacity per path (subtle by design),
              // so the wrapper needs full opacity, not another multiplier on top of
              // that — otherwise the two compound into near-invisible. In dark mode
              // the doodle's dark-gray ink would vanish against a dark canvas, so we
              // invert it to light strokes instead.
              className="pointer-events-none absolute inset-0 z-0 opacity-100 dark:opacity-90 dark:invert"
              style={{
                backgroundImage: "url('/brand/doodles.svg')",
                backgroundRepeat: "repeat",
                backgroundSize: "280px auto",
              }}
            />

            {/* Compose Trigger */}
            <div className="relative z-10 w-full max-w-[620px] px-4 mb-2 shrink-0 md:max-w-[740px] md:px-6">
              <button
                type="button"
                onClick={() => {
                  // The full sentence, not whatever partial fragment had
                  // typed out so far (see currentFullPromptRef).
                  setComposePlaceholder(currentFullPromptRef.current || promptText);
                  setShowCreate(true);
                  dismissComposeHint();
                }}
                className="group flex w-full cursor-pointer items-center gap-2 rounded-full bg-surface-2 px-3 py-2 shadow-sm shadow-black/5 ring-1 ring-line/50 font-poppins text-base font-medium text-faint transition md:gap-3 md:rounded-none md:bg-transparent md:px-0 md:py-0 md:pb-2 md:border-b-2 md:border-line md:shadow-none md:ring-0 md:hover:border-brand/60 md:hover:text-brand focus:outline-none"
              >
                {/* Only the avatar + prompt pulse-scale \u2014 the trailing Plus
                    icon sits outside this wrapper so it stays put, unscaled. */}
                <motion.div
                  className="flex min-w-0 flex-1 items-center gap-2 md:gap-3"
                  animate={{ scale: promptPulse ? 1.02 : 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 18 }}
                >
                  <div className="relative h-7 w-7 shrink-0 md:h-10 md:w-10">
                    <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-brand/5 ring-1 ring-line/50 md:h-10 md:w-10">
                      <Avatar src={myImageUrl} />
                    </div>
                    {avatarPing > 0 && (
                      <motion.span
                        key={avatarPing}
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-full border-2 border-brand"
                        initial={{ scale: 1, opacity: 0.6 }}
                        animate={{ scale: 1.7, opacity: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    )}
                  </div>
                  <span className="flex min-w-0 flex-1 items-center overflow-hidden">
                    {/* Blinking caret up front, deliberately \u2014 a live "type here"
                        cue that invites tapping, even though it opens the full
                        composer rather than accepting text inline. */}
                    <span
                      aria-hidden
                      className="mr-1 inline-block h-[1.1em] w-[2px] shrink-0 animate-pulse bg-brand"
                    />
                    <span
                      className={`min-w-0 flex-1 truncate text-left text-sm transition duration-300 md:text-base ${
                        promptFading ? "opacity-0" : "opacity-100"
                      } ${promptPulse ? "text-brand" : ""}`}
                    >
                      {promptText || '\u00A0'}
                    </span>
                  </span>
                </motion.div>
                {/* Trailing icon \u2014 a persistent, universal "this creates something"
                    cue. Solid brand fill: this is the primary CTA on the whole
                    feed, so it should read as more confident than the per-gist
                    dot-menu (a secondary utility), not less. */}
                <span className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-white transition md:h-7 md:w-7">
                  <Plus className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </span>
              </button>

              {/* One-time coach mark: teaches that this row is tappable. Arrow
                  points at the avatar, wherever it currently sits (smaller,
                  left-shifted on mobile's pill; original spot on desktop). */}
              <AnimatePresence>
                {showComposeHint && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                    className="absolute left-7 top-full z-20 mt-1.5 flex flex-col items-center md:left-16"
                  >
                    <span aria-hidden className="h-2 w-2 rotate-45 bg-brand-ink" />
                    <span className="-mt-1 rounded-full bg-brand-ink px-3 py-1.5 font-poppins text-xs font-medium text-white shadow-lg">
                      Tap here make you gist!
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {loading ? (
              <div className="relative z-10 flex min-h-0 flex-1 w-full justify-center px-4">
                <div className="h-full w-full max-w-[620px] md:max-w-[740px]">
                  <GistCardSkeleton />
                </div>
              </div>
            ) : gists.length ? (
              <div className="relative z-10 flex min-h-0 flex-1 w-full flex-col">
                {/* On mobile the card no longer fills the whole remaining
                    height — a compact comment input sits below it, flush,
                    with zero forced gap either side. The input takes only
                    its own natural height (shrink-0, not a fixed 20% flex
                    share — a forced band left dead space around the actual
                    pill-shaped input, exactly the "margins" that shouldn't
                    be there); the card (flex-1) fills whatever's left,
                    which lands close to that ~80% anyway. Desktop reverts
                    both to their original behavior: the card back to
                    filling the whole area, the mobile composer hidden
                    entirely (the real CommentPanel already covers that in
                    its own side pane there). */}
                <div className="flex min-h-0 w-full flex-1">
                  <GistStack
                    gists={gists}
                    onCurrentChange={setCurrent}
                    onGistDeleted={(gistId) =>
                      setGists((prev) => prev.filter((g) => g.gist_id !== gistId))
                    }
                    onGistEdited={(fresh) =>
                      setGists((prev) => prev.map((g) => (g.gist_id === fresh.gist_id ? fresh : g)))
                    }
                    onNearEnd={loadMore}
                  />
                </div>
                {/* Natural height only (shrink-0) — sits immediately below
                    the card with zero gap, and its own bottom edge sits
                    flush against the bottom of the screen (the outer
                    container's bottom padding was dropped on mobile for
                    exactly this — see its own comment above).

                    This is NOT a real input — tapping it never focuses
                    anything in place, it just opens CommentSheet (the real
                    comment surface, autofocused input and all) — a button
                    styled to look like one, same "tap to open the real
                    thing" pattern the gist compose-trigger up top uses. */}
                {/* Solid fill both themes — needed so the doodle pattern
                    tiled behind the whole feed column doesn't show through
                    this area — but no border/shadow/ring of its own, so it
                    reads as part of the page rather than a second, separately
                    boxed card sitting on top of the pill. */}
                <div className="flex w-full shrink-0 items-center gap-3 bg-surface px-4 py-3 dark:bg-brand-ink md:hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setCommentSheetAutoFocus(true);
                      setShowCommentSheet(true);
                    }}
                    className="block flex-1 rounded-3xl border-0 bg-[#A9C9F85C] px-4 py-4 text-left font-poppins text-sm text-ink/50"
                  >
                    Talk your own...
                  </button>
                  {/* Icon + live count, both inside the circle, for whichever
                      gist is currently in view (current, not gists[0] —
                      updates as the stack is swiped). Just opens the sheet
                      to look, so it does not autofocus the composer the way
                      the pill does. */}
                  <button
                    type="button"
                    onClick={() => {
                      setCommentSheetAutoFocus(false);
                      setShowCommentSheet(true);
                    }}
                    aria-label="View comments"
                    className="flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full bg-brand text-white shadow-sm shadow-brand/30"
                  >
                    <CommentIconFill className="h-4 w-4" weight="fill" />
                    <span className="font-poppins text-[9px] font-medium leading-none tabular-nums">
                      {compactNumber(current?.counts?.comments_count)}
                    </span>
                  </button>
                </div>
              </div>
            ) : loadError ? (
              <div className="relative z-10 flex flex-1 w-full flex-col items-center justify-center gap-3 text-center px-6">
                <RefreshCw className="h-10 w-10 text-muted" />
                <p className="font-poppins text-sm text-muted">
                  Abeg we no fit load the gists — check your connection.
                </p>
                <button
                  type="button"
                  onClick={load}
                  className="rounded-full bg-brand px-4 py-2 font-poppins text-sm font-semibold text-white transition hover:bg-brand-dark"
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="relative z-10 flex flex-1 w-full flex-col items-center justify-center gap-3 text-center">
                <Illustration name="Kappymagnifyingglass" className="h-40 w-auto" />
                <p className="font-poppins text-sm text-muted">
                  No gist dey here yet. Be the first to gist!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right pane — comments, fixed width. Desktop-only (hidden below
            md): at a fixed 360px it would otherwise crush the whole feed
            column on a phone-width viewport. GistMediaOverlay's own
            `md:right-[360px]` already assumed this panel was desktop-only —
            this is what actually makes that assumption true. */}
        <div className="hidden h-full w-[360px] shrink-0 md:block">
          <CommentPanel gist={current} />
        </div>
      </div>

      <CreateGistSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onPosted={(fresh) =>
          setGists((prev) => {
            // Land right after whatever gist is currently in view — not
            // the end of a list that could be hundreds deep — so the very
            // next swipe shows the gist just posted, purely a local
            // insertion position (the backend's own ordering/pagination is
            // untouched). Falls back to the front of the list on the rare
            // chance nothing's currently in view (e.g. an empty feed).
            const idx = current ? prev.findIndex((g) => g.gist_id === current.gist_id) : -1;
            if (idx === -1) return [fresh, ...prev];
            return [...prev.slice(0, idx + 1), fresh, ...prev.slice(idx + 1)];
          })
        }
        placeholder={composePlaceholder}
      />
      <CommentSheet
        open={showCommentSheet}
        onClose={() => setShowCommentSheet(false)}
        gist={current}
        autoFocusInput={commentSheetAutoFocus}
      />
    </AppShell>
  );
}
