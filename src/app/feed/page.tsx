"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/components/auth/AuthGate";
import { GistStack } from "@/components/gist/GistStack";
import { GistCardSkeleton } from "@/components/gist/GistCardSkeleton";
import { CreateGistSheet } from "@/components/gist/CreateGistSheet";
import { CommentPanel } from "@/components/comment/CommentPanel";
import { Illustration } from "@/components/brand/illustrations";
import { Wordmark } from "@/components/brand/Wordmark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SettingsIconFill, Plus } from "@/components/ui/icons";
import { AnimatePresence } from "framer-motion";
import { useGistStore } from "@/stores/gistStore";
import { useCommentStore } from "@/stores/commentStore";
import { useAuthStore } from "@/stores/authStore";
import { SAMPLE_GISTS } from "@/lib/sampleGists";
import type { Gist } from "@/types";

type Tab = "Gist" | "Amebo";

// Compose-trigger animation timing — two independent loops (see the effects below):
// a fast "notice me" pulse, and a slow prompt rotation.
const PROMPT_PULSE_INTERVAL_MS = 3000; // how often the flash + avatar ping fires
const PROMPT_PULSE_MS = 550; // how long each flash lasts
const PROMPT_ROTATE_MS = 60_000; // how often the prompt text changes
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

export default function FeedPage() {
  return (
    <AuthGate allow={["active"]}>
      <FeedContent />
    </AuthGate>
  );
}

function FeedContent() {
  const listGists = useGistStore((s) => s.list);
  const prefetchComments = useCommentStore((s) => s.prefetchBatch);
  const avitag = useAuthStore((s) => s.avitag);

  const [gists, setGists] = useState<Gist[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Sample/demo data has no real backend cursor to page through — pagination
  // only makes sense once the live API actually returned something.
  const [usingSampleData, setUsingSampleData] = useState(false);
  // Once the backend's cursor pagination genuinely runs out (an empty page
  // back), stop asking — otherwise sitting near the end of the feed would
  // keep re-firing the same exhausted request indefinitely (loadMore's own
  // identity changes each time loadingMore toggles, which re-triggers
  // GistStack's near-end effect even though nothing about the list moved).
  const [exhausted, setExhausted] = useState(false);
  const [tab, setTab] = useState<Tab>("Gist");
  const [current, setCurrent] = useState<Gist>();
  const [showCreate, setShowCreate] = useState(false);
  // Snapshotted at click time (not the live promptText) — the trigger's
  // rotating prompt keeps typing/swapping in the background while the
  // modal is open, so the placeholder has to freeze to whatever was showing
  // the moment someone actually clicked, not keep changing under them.
  const [composePlaceholder, setComposePlaceholder] = useState("");
  const [promptText, setPromptText] = useState("");
  const [promptDone, setPromptDone] = useState(false);
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
   * Two independent loops for the compose trigger, on purpose decoupled:
   *
   * 1. Content — types in a prompt, then swaps to a new one every
   *    PROMPT_ROTATE_MS (slow — a real content change, not decoration).
   * 2. Attention — flashes the text + pings the avatar every
   *    PROMPT_PULSE_INTERVAL_MS (fast — a "notice me" cue, independent of
   *    whether the text is actually changing at that moment).
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
      const raw = PROMPTS[idx];
      const clean = raw.endsWith("?") ? raw.slice(0, -1) : raw;
      return avitag ? `${clean}, @${avitag}?` : raw;
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

    const swap = () => {
      setPromptFading(true);
      afterTyping(() => {
        setPromptFading(false);
        typeIn(nextPrompt(), () => {});
      }, PROMPT_FADE_MS);
    };

    setPromptDone(false);
    typeIn(nextPrompt(), () => setPromptDone(true));
    const rotateInterval = window.setInterval(swap, PROMPT_ROTATE_MS);

    return () => {
      cancelled = true;
      clearTypingTimers();
      window.clearInterval(rotateInterval);
    };
  }, [avitag]);

  // Attention pulse: flash the text + ping the avatar every few seconds,
  // completely independent of when the prompt text itself changes.
  useEffect(() => {
    if (!promptDone) return;
    let flashTimeout: number | undefined;
    const pulseInterval = window.setInterval(() => {
      setPromptPulse(true);
      setAvatarPing((n) => n + 1);
      flashTimeout = window.setTimeout(() => setPromptPulse(false), PROMPT_PULSE_MS);
    }, PROMPT_PULSE_INTERVAL_MS);
    return () => {
      window.clearInterval(pulseInterval);
      if (flashTimeout) window.clearTimeout(flashTimeout);
    };
  }, [promptDone]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listGists();
      const gotReal = data.length > 0;
      setGists(gotReal ? data : SAMPLE_GISTS);
      setUsingSampleData(!gotReal);
      setExhausted(false);
      // Only prefetch for real gists against a reachable backend — doing
      // this for the SAMPLE_GISTS fallback here would hit the real (working)
      // API with fake "demo-*" ids, cache back a genuine empty result, and
      // permanently block the nicer demo-comment fallback CommentPanel's own
      // per-gist fetch would otherwise fall back to.
      if (gotReal) void prefetchComments(data.map((g) => g.gist_id));
    } catch {
      // Backend unreachable → show demo gists so the feed is still testable.
      setGists(SAMPLE_GISTS);
      setUsingSampleData(true);
      void prefetchComments(SAMPLE_GISTS.map((g) => g.gist_id));
    } finally {
      setLoading(false);
    }
  }, [listGists, prefetchComments]);

  const loadMore = useCallback(async () => {
    if (loadingMore || usingSampleData || exhausted || gists.length === 0) return;
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
  }, [exhausted, gists, listGists, loadingMore, prefetchComments, usingSampleData]);

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
                  <Illustration name="Kamill" className="h-full w-full object-cover" />
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
          <div className="relative flex min-h-0 flex-1 flex-col items-center pt-3 pb-4 sm:pt-4 sm:pb-6">
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
            <div className="relative z-10 w-full max-w-[620px] md:max-w-[740px] px-6 mb-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  // The full sentence, not whatever partial fragment had
                  // typed out so far (see currentFullPromptRef).
                  setComposePlaceholder(currentFullPromptRef.current || promptText);
                  setShowCreate(true);
                  dismissComposeHint();
                }}
                className="group flex w-full cursor-pointer items-center gap-3 border-b-2 border-line pb-2 font-poppins text-base font-medium text-faint transition hover:border-brand/60 hover:text-brand focus:outline-none"
              >
                {/* Only the avatar + prompt pulse-scale \u2014 the trailing Plus
                    icon sits outside this wrapper so it stays put, unscaled. */}
                <motion.div
                  className="flex flex-1 items-center gap-3"
                  animate={{ scale: promptPulse ? 1.02 : 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 18 }}
                >
                  <div className="relative h-10 w-10 shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand/5 ring-1 ring-line/50">
                      <Illustration name="Kamill" className="h-full w-full object-cover" />
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
                  <span className="flex flex-1 items-center">
                    {/* Blinking caret up front, deliberately \u2014 a live "type here"
                        cue that invites tapping, even though it opens the full
                        composer rather than accepting text inline. */}
                    <span
                      aria-hidden
                      className="mr-1 inline-block h-[1.1em] w-[2px] shrink-0 animate-pulse bg-brand"
                    />
                    <span
                      className={`transition duration-300 ${
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
                <span className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-white transition">
                  <Plus className="h-4 w-4" />
                </span>
              </button>

              {/* One-time coach mark: teaches that this row is tappable. Arrow
                  points straight up at the row, bubble sits just beneath it. */}
              <AnimatePresence>
                {showComposeHint && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                    className="absolute left-16 top-full z-20 mt-1.5 flex flex-col items-center"
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
              <div className="relative z-10 flex min-h-0 flex-1 w-full">
                <GistStack
                  gists={gists}
                  onCurrentChange={setCurrent}
                  onGistDeleted={(gistId) =>
                    setGists((prev) => prev.filter((g) => g.gist_id !== gistId))
                  }
                  onGistEdited={load}
                  onNearEnd={loadMore}
                />
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
        onPosted={load}
        placeholder={composePlaceholder}
      />
    </AppShell>
  );
}
