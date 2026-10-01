"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Plus } from "@/components/ui/icons";
import { useAuthStore } from "@/stores/authStore";
import { useHotStore, type HotPost, type HotPerson } from "@/stores/hotStore";
import { EDeyHotComposer } from "./EDeyHotComposer";
import { EDeyHotViewer, type ViewerPerson } from "./EDeyHotViewer";
import { HotExplainerModal, hotExplainerDismissed, dismissHotExplainerForever } from "./HotExplainerModal";

const HOURS = 60 * 60 * 1000;
const DAY = 24 * HOURS;

// No real avatar photo on file — same fallback treatment "You" already got
// before there was any real data to show, now used for anyone else in the
// feed without a profile photo too (a KREATOR/KOMPANY/etc. poster, or a
// student who never set one), rather than reintroducing the old mock
// data's per-person decorative color variety, which was never a real
// design requirement.
const FALLBACK_AVATAR_GRADIENT = "linear-gradient(135deg, var(--brand-light), var(--brand))";

function avatarGradientFor(imageUrl: string | null): string {
  return imageUrl ? `url("${imageUrl}")` : FALLBACK_AVATAR_GRADIENT;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "gone";
  const h = Math.floor(ms / HOURS);
  const m = Math.floor((ms % HOURS) / (60 * 1000));
  if (h >= 1) return `${h}h`;
  return `${Math.max(1, m)}m`;
}

function clampFraction(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// A single post's own flame sweep, confined to one arc [start,end) instead
// of the full circle — the same shape a lone post's ring always used, just
// parameterized so it can also be one slice of a multi-post ring. Hard
// stops (repeating the same angle twice) are what give each segment a
// crisp edge instead of blending into its neighbor. Mostly Kampos's own
// brand yellow (--hot-c), not the generic "fire is red" default — red
// (--hot-a) only shows up as a small sliver right at the tail (~90%
// yellow, ~10% red), no orange in between. A SEEN post's own arc is just
// flat grey, same treatment as a fully-seen ring — per-post, not
// all-or-nothing for the whole person.
function segmentStops(post: HotPost, now: number, seen: boolean, startDeg: number, endDeg: number): string {
  if (seen) return `var(--color-line) ${startDeg}deg, var(--color-line) ${endDeg}deg`;
  const width = endDeg - startDeg;
  const clamped = clampFraction((post.expiresAt - now) / DAY);
  const flameLen = clamped * width;
  return [
    `var(--hot-c) ${startDeg}deg`,
    `var(--hot-c) ${startDeg + flameLen * 0.85}deg`,
    `var(--hot-a) ${startDeg + flameLen}deg`,
    `var(--color-line) ${startDeg + flameLen}deg`,
    `var(--color-line) ${endDeg}deg`,
  ].join(", ");
}

const MAX_SEGMENTS = 6;

// Posts must already be sorted soonest-expiring first. One post: the
// ring's original full-circle sweep, unchanged. Multiple posts: the ring
// splits into one arc per post (up to MAX_SEGMENTS, soonest — i.e. most
// urgent — first) with small gaps between them, each burning down on its
// OWN post's clock rather than one shared arc for the whole person.
function buildRingGradient(posts: HotPost[], now: number, seenPostIds: Set<string>): string {
  if (posts.length === 0) return "var(--color-line)";
  if (posts.length === 1) return `conic-gradient(from -90deg, ${segmentStops(posts[0], now, seenPostIds.has(posts[0].id), 0, 360)})`;

  const visible = posts.slice(0, MAX_SEGMENTS);
  const n = visible.length;
  const gapDeg = Math.max(4, 10 - n);
  const segWidth = (360 - gapDeg * n) / n;
  const stops: string[] = [];
  let cursor = 0;
  visible.forEach((post, i) => {
    const start = cursor;
    const end = start + segWidth;
    stops.push(segmentStops(post, now, seenPostIds.has(post.id), start, end));
    cursor = end;
    if (i < n - 1) {
      stops.push(`transparent ${cursor}deg`, `transparent ${cursor + gapDeg}deg`);
      cursor += gapDeg;
    }
  });
  return `conic-gradient(from -90deg, ${stops.join(", ")})`;
}

/** Loading state — eight grey circles (matching the app's own bg-line/60
 * skeleton convention, see FeedGistCardSkeleton) but with the same real
 * fire ring shimmering around each one (.hot-ring-live, the exact
 * rotating/flickering conic-gradient every real HotRing uses) — so even
 * the "nothing's loaded yet" state still reads as fire, not a generic
 * grey pulse. Shown only until the very first fetch resolves (loaded),
 * never again after — a refetch later just swaps rings in place. */
function HotRailSkeleton() {
  return (
    <div className="flex w-full gap-3.5 overflow-x-auto px-4 pb-1 pt-2.5 no-scrollbar sm:px-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex shrink-0 flex-col items-center gap-1">
          <div className="relative h-[46px] w-[46px] shrink-0">
            <div
              className="hot-ring-live absolute inset-0 rounded-full"
              style={
                {
                  backgroundImage: "conic-gradient(var(--hot-c), var(--hot-b), var(--hot-a), var(--hot-b), var(--hot-c))",
                  "--hot-spin-dur": "3s",
                  "--hot-flicker-sat": 1.2,
                  "--hot-flicker-bright": 1.15,
                } as React.CSSProperties
              }
            />
            <div className="absolute inset-[2px] rounded-full bg-line/60" />
          </div>
          <div className="h-[9px] w-9 rounded-full bg-line/50" />
        </div>
      ))}
    </div>
  );
}

/** One ring — for a single post, a full-circle flame arc; for multiple, a
 * segmented ring (one independently burning-down arc per post, capped at
 * MAX_SEGMENTS with a "+N" badge for the rest — see buildRingGradient).
 * Either way it sits under a rotate+flicker animation so it reads as a
 * living flame rather than a static badge, driven by the SOONEST post's
 * own remaining time: fresh spins fast and flickers bright, near-expiry
 * is almost still and duller — an ember cooling, not getting MORE
 * agitated as it dies. Seen rings drop the color, the segments, and the
 * animation entirely — stillness itself is the "already looked" signal,
 * same as a dimmed IG ring. */
function HotRing({
  gradient,
  avatarNode,
  posts,
  now,
  seen,
  seenPostIds,
}: {
  gradient?: string;
  avatarNode?: React.ReactNode;
  posts: HotPost[];
  now: number;
  /** ALL of this person's posts are seen — the ring goes fully static/grey,
   * dropping the animation entirely. A partially-seen ring (some but not
   * all posts in `seenPostIds`) still animates; only the individually-seen
   * segments within it render grey via buildRingGradient. */
  seen: boolean;
  seenPostIds: Set<string>;
}) {
  const soonest = posts[0];
  const clamped = soonest ? clampFraction((soonest.expiresAt - now) / DAY) : 0;
  // Always a `backgroundImage` value, never the `background` shorthand —
  // this used to toggle between the two depending on `seen`, which is
  // exactly the pattern React warns breaks ("conflicting property... can
  // lead to styling bugs") since it means the SAME style key flips identity
  // across rerenders. A flat color wrapped as a solid-color gradient is
  // still a valid `backgroundImage`, so seen never needs `background` at
  // all.
  const ringBackground = seen
    ? "linear-gradient(var(--color-line), var(--color-line))"
    : buildRingGradient(posts, now, seenPostIds);
  const overflow = Math.max(0, posts.length - MAX_SEGMENTS);

  // Fresh (clamped=1): 4s per spin, full flicker brightness. Near-expiry
  // (clamped=0): 48s per spin — visually almost frozen — and a much
  // duller flicker range, like the fire is running out of fuel.
  const spinDuration = 4 + (1 - clamped) * 44;
  const flickerPeakSat = 1.05 + clamped * 0.3;
  const flickerPeakBright = 1.03 + clamped * 0.16;

  return (
    <div className="relative h-[46px] w-[46px] shrink-0">
      <div
        className={`absolute inset-0 rounded-full ${!seen ? "hot-ring-live" : ""}`}
        style={{
          backgroundImage: ringBackground,
          ...(seen
            ? {}
            : ({
                "--hot-spin-dur": `${spinDuration}s`,
                "--hot-flicker-sat": flickerPeakSat,
                "--hot-flicker-bright": flickerPeakBright,
              } as React.CSSProperties)),
        }}
      />
      <div className="absolute inset-[2px] rounded-full bg-surface p-[2px]">
        {avatarNode ?? (
          <div className="h-full w-full rounded-full bg-cover bg-center" style={{ backgroundImage: gradient }} />
        )}
      </div>
      {overflow > 0 && (
        <span className="absolute -bottom-1 -left-1 flex h-[13px] min-w-[13px] items-center justify-center rounded-full border border-surface bg-brand-ink px-[3px] font-nunito text-[6.5px] font-extrabold text-white">
          +{overflow}
        </span>
      )}
    </div>
  );
}

export function EDeyHotRail() {
  const myAvitag = useAuthStore((s) => s.avitag);
  const myImageUrl = useAuthStore(
    (s) => (s.profiles.find((p) => p.avitag === s.avitag)?.image_url as string | undefined) ?? null,
  );

  const myPosts = useHotStore((s) => s.myPosts);
  const feed = useHotStore((s) => s.feed);
  const loaded = useHotStore((s) => s.loaded);
  const fetchAll = useHotStore((s) => s.fetchAll);
  const markSeenInStore = useHotStore((s) => s.markSeen);
  const flushSeen = useHotStore((s) => s.flushSeen);
  const deletePost = useHotStore((s) => s.deletePost);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // `seenPostIds` derived straight from each post's own `.seen` flag
  // (already correct per-viewer, from the backend's own hot_post_seen
  // join) rather than tracked as separate local state — HotRing/
  // buildRingGradient/EDeyHotViewer all still take a plain Set<string>,
  // same prop shape they always have, just fed from real data now instead
  // of mock state.
  const seenPostIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of myPosts) if (p.seen) ids.add(p.id);
    for (const person of feed) for (const p of person.posts) if (p.seen) ids.add(p.id);
    return ids;
  }, [myPosts, feed]);

  // `now` lives in state rather than a plain `Date.now()` call in the render
  // body — the latter is an impure call during render (React's own purity
  // rule flags it). Updated once a minute so every ring's burn-down arc
  // visibly shrinks over real time, not just on next navigation.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [composerOpen, setComposerOpen] = useState(false);
  const [explainerOpen, setExplainerOpen] = useState(false);
  // Every path that opens the composer goes through this one gate — the
  // explainer shows once (first-ever tap, per this browser's own
  // localStorage flag), then every SUBSEQUENT compose attempt skips
  // straight to the composer, same as hotExplainerDismissed() already
  // deciding not to show it again. Either explainer button ("Got it" or
  // "Don't show me again") still opens the composer right after — this is
  // a one-time heads up, not a gate that blocks posting.
  const openComposer = () => {
    if (hotExplainerDismissed()) setComposerOpen(true);
    else setExplainerOpen(true);
  };

  // A post past its own 24h line is pruned from what's actually rendered,
  // not just left to show a "gone"/zero state — the backend already
  // refuses to return an expired post on a fresh fetch (every read-side
  // query filters `created_at > NOW() - 24h`), so the client re-ticking
  // past that same line should make it vanish here too, rather than
  // waiting on the next fetchAll() (which only fires on mount or a WS
  // push, not continuously) to catch up. A person whose every post just
  // expired drops out of the rail entirely, same as if the backend had
  // never sent them this time around.
  const rings = useMemo(
    () =>
      feed
        .map((person: HotPerson) => {
          // Soonest-expiring first — buildRingGradient/HotRing both assume
          // this order (segment 0 = most urgent post, drives the ring's
          // overall spin speed). The backend already returns each person's
          // posts oldest-first (soonest to expire), so this sort is a no-op
          // in practice — kept explicit so this component's own correctness
          // never silently depends on the API happening to agree.
          const sortedPosts = person.posts.filter((p) => p.expiresAt > now).sort((a, b) => a.expiresAt - b.expiresAt);
          return {
            person,
            sortedPosts,
            remainingMs: sortedPosts.length > 0 ? sortedPosts[0].expiresAt - now : 0,
            seen: sortedPosts.length > 0 && sortedPosts.every((p) => seenPostIds.has(p.id)),
          };
        })
        .filter((r) => r.sortedPosts.length > 0),
    [feed, seenPostIds, now],
  );

  // Same pruning for your own stack — once every post you've put up has
  // aged out, the avatar falls back to the dashed "add yours" state
  // instead of showing a ring with nothing live left in it.
  const visibleMyPosts = useMemo(() => myPosts.filter((p) => p.expiresAt > now), [myPosts, now]);

  // The "As e dey hot" chip is an explainer, not permanent chrome — it only
  // needs to register once per visit, then get out of the rings' way.
  const [labelPhase, setLabelPhase] = useState<"typing" | "burning" | "gone">("typing");
  useEffect(() => {
    const burnTimer = setTimeout(() => setLabelPhase("burning"), 5000);
    const goneTimer = setTimeout(() => setLabelPhase("gone"), 5000 + 1300);
    return () => {
      clearTimeout(burnTimer);
      clearTimeout(goneTimer);
    };
  }, []);

  const markPostSeen = (postId: string) => markSeenInStore(postId);

  // The viewer works on the same soonest-expiring-first post order the
  // rings already use, translated into its own decoupled ViewerPerson
  // shape — keeps EDeyHotViewer generic instead of coupled to this file's
  // own store types.
  const viewerPeople: ViewerPerson[] = useMemo(
    () =>
      rings.map(({ person, sortedPosts }) => ({
        avitag: person.avitag,
        firstName: person.firstName,
        avatarGradient: avatarGradientFor(person.imageUrl),
        campusTag: person.campusTag ?? undefined,
        majorTag: person.majorTag ?? undefined,
        level: person.level ?? undefined,
        bio: person.bio ?? undefined,
        posts: sortedPosts.map((p) => ({
          id: p.id,
          text: p.text ?? "",
          createdAt: p.createdAt,
          mediaUrl: p.mediaUrl,
          mediaKind: p.type === "text" ? null : p.type,
          colorKey: p.colorKey,
          thumbnailUrl: p.thumbnailUrl,
        })),
      })),
    [rings],
  );
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // A separate, single-person viewer instance for your OWN stack — kept
  // apart from viewerPeople/viewerIndex above (which is everyone else's
  // swipeable list) rather than folding "you" into that same array, since
  // swiping past the end of a one-person list just closes it, which is the
  // right behavior here (there's no "next person" to swipe to from your
  // own stack) but would be wrong behavior mixed into the real list.
  const [ownViewerOpen, setOwnViewerOpen] = useState(false);
  const ownViewerPeople: ViewerPerson[] = useMemo(
    () => [
      {
        avitag: myAvitag ?? "",
        firstName: "You",
        avatarGradient: avatarGradientFor(myImageUrl),
        posts: [...visibleMyPosts]
          .sort((a, b) => a.expiresAt - b.expiresAt)
          .map((p) => ({
            id: p.id,
            text: p.text ?? "",
            createdAt: p.createdAt,
            mediaUrl: p.mediaUrl,
            mediaKind: p.type === "text" ? null : p.type,
            colorKey: p.colorKey,
            thumbnailUrl: p.thumbnailUrl,
          })),
      },
    ],
    [myAvitag, myImageUrl, visibleMyPosts],
  );

  return (
    <div className="pb-2.5">
      {/* Deliberately NOT wrapped in the same mx-auto max-w-[740px] column the
          wordmark row uses — that column is what made this feel boxed-in and
          only fit 4-5 rings before the padding cut it off. The scroll track
          itself spans the full panel width (edge to edge on mobile, and on
          desktop too since AppShell's "feed" variant is already
          md:max-w-none) with just a small edge inset. */}
      {/* pt-2.5: `overflow-x-auto` implicitly makes the y-axis "auto" too
          (the CSS spec ties the two together — you can't scroll one axis
          without the other becoming at least clipping), so the urgent
          badge's `-top-1` offset (see below) was getting sliced off by the
          container's own top edge with nothing above it to clip into. */}
      {/* The section label — its OWN row above the scrollable rings, never
          inside it, so it can't be mistaken for a post/person the way the
          old in-row ring badge could. A dramatic ring of fire genuinely
          circles the pill (a rotating conic-gradient clipped to a thin
          border, same trick real "animated gradient border" UIs use, plus
          a softer blurred copy behind it for glow) — not the flat static
          badge this used to be. Shown once per page load, then burns away
          in one real animated beat 5s later (flare bright, embers burst
          outward, THEN the whole row's height collapses via max-height so
          the rings actually shift up and reclaim the space, not just fade
          in place). */}
      {labelPhase !== "gone" && (
        <div
          // overflow-x-auto rather than plain overflow-hidden — the added
          // "disappears after 24 hours" text can run wider than the
          // narrowest phones, and this scrolls it instead of clipping it,
          // while overflow-y-hidden (needed for the max-height collapse
          // below) still applies on its own axis.
          className={`overflow-y-hidden overflow-x-auto px-4 no-scrollbar sm:px-6 ${
            labelPhase === "burning" ? "hot-eyebrow-collapse" : ""
          }`}
          style={{ maxHeight: 40 }}
        >
          <div className={`relative inline-flex ${labelPhase === "burning" ? "hot-eyebrow-flare" : "hot-eyebrow-enter"}`}>
            {/* soft blurred glow, larger and looser than the crisp ring below */}
            <div
              className="hot-ring-live absolute -inset-2 rounded-full blur-md"
              style={
                {
                  backgroundImage: "conic-gradient(var(--hot-c), var(--hot-b), var(--hot-a), var(--hot-b), var(--hot-c))",
                  opacity: 0.55,
                  "--hot-spin-dur": "2.6s",
                  "--hot-flicker-sat": 1.3,
                  "--hot-flicker-bright": 1.2,
                } as React.CSSProperties
              }
            />
            {/* the crisp ring itself — an oversized rotating conic-gradient,
                clipped down to a thin border by this wrapper's padding +
                overflow-hidden, so it reads as a real moving flame outline
                around the pill regardless of the pill's (non-circular)
                shape. */}
            <div className="relative overflow-hidden rounded-full p-[2px]">
              <div
                className="hot-ring-live absolute -inset-[60%] rounded-full"
                style={
                  {
                    backgroundImage: "conic-gradient(var(--hot-c), var(--hot-b), var(--hot-a), var(--hot-b), var(--hot-c))",
                    "--hot-spin-dur": "2.6s",
                    "--hot-flicker-sat": 1.3,
                    "--hot-flicker-bright": 1.2,
                  } as React.CSSProperties
                }
              />
              <div className="relative flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface px-3.5 py-1.5">
                {/* Three layered flame shapes, each flickering on its own
                    independent timing (outer/mid/core) — a real licking
                    flame instead of a static icon glyph. Same trick as a
                    hand-lit match's flame, just sized down to sit inline
                    with the text. */}
                <div className="relative h-4 w-3 shrink-0" style={{ filter: "drop-shadow(0 0 3px rgba(255,193,7,.5))" }}>
                  <span
                    className="hot-flame-lick-outer absolute bottom-0 left-1/2 -translate-x-1/2 rounded-[50%/62%_62%_38%_38%]"
                    style={{ width: "12px", height: "16px", backgroundImage: "linear-gradient(180deg, var(--hot-a), var(--hot-b) 60%, var(--hot-c))" }}
                  />
                  <span
                    className="hot-flame-lick-mid absolute bottom-0 left-1/2 -translate-x-1/2 rounded-[50%/62%_62%_38%_38%]"
                    style={{ width: "8px", height: "11px", backgroundImage: "linear-gradient(180deg, var(--hot-b), var(--hot-c))" }}
                  />
                  <span
                    className="hot-flame-lick-core absolute bottom-0 left-1/2 -translate-x-1/2 rounded-[50%/62%_62%_38%_38%]"
                    style={{ width: "4px", height: "6px", backgroundImage: "linear-gradient(180deg, var(--hot-c), #fff6d6)" }}
                  />
                </div>
                <span className="font-nunito text-[12.5px] font-extrabold text-ink">As e dey hot</span>
                <span className="font-nunito text-[10.5px] font-semibold text-faint">· disappears after 24 hours</span>
              </div>
            </div>
            {labelPhase === "burning" &&
              [-10, 10, 28, 46, 64, 82].map((left, i) => (
                <span
                  key={i}
                  className="hot-eyebrow-ember"
                  style={{ left: `${left}%`, animationDelay: `${i * 45}ms` }}
                />
              ))}
          </div>
        </div>
      )}

      {!loaded ? (
        <HotRailSkeleton />
      ) : (
      <div className="flex w-full gap-3.5 overflow-x-auto px-4 pb-1 pt-2.5 no-scrollbar sm:px-6">

        {/* Two separate tap targets now, not one button doing both jobs —
            the avatar/ring opens the VIEWER (your own stack), the "+"
            badge opens the COMPOSER. With nothing posted yet there's
            nothing to view, so the avatar falls back to the composer too;
            once you've posted, tapping the avatar and tapping "+" go to
            two genuinely different places. */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => (visibleMyPosts.length > 0 ? setOwnViewerOpen(true) : openComposer())}
              aria-label={visibleMyPosts.length > 0 ? "View your Hot stories" : "Post something hot"}
              className="block active:scale-95"
            >
              {visibleMyPosts.length > 0 ? (
                <HotRing
                  posts={[...visibleMyPosts].sort((a, b) => a.expiresAt - b.expiresAt)}
                  now={now}
                  seen={visibleMyPosts.every((p) => seenPostIds.has(p.id))}
                  seenPostIds={seenPostIds}
                  avatarNode={
                    <div className="h-full w-full overflow-hidden rounded-full">
                      <Avatar src={myImageUrl} />
                    </div>
                  }
                />
              ) : (
                <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full border-2 border-dashed border-faint/70">
                  <div className="h-[38px] w-[38px] overflow-hidden rounded-full ring-1 ring-line">
                    <Avatar src={myImageUrl} />
                  </div>
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={openComposer}
              aria-label="Post something hot"
              className="absolute -bottom-0.5 -right-0.5 flex h-[16px] w-[16px] items-center justify-center rounded-full border-2 border-surface text-white active:scale-90"
              style={{ backgroundColor: "var(--hot-c)" }}
            >
              <Plus className="h-2 w-2" strokeWidth={3} />
            </button>
          </div>
          <span className="max-w-[50px] truncate font-nunito text-[9.5px] font-semibold text-muted">
            {visibleMyPosts.length > 0 ? "You" : "Add yours"}
          </span>
        </div>

        {rings.map(({ person, sortedPosts, remainingMs, seen }, i) => (
          <button
            key={person.avitag}
            type="button"
            onClick={() => setViewerIndex(i)}
            className="flex shrink-0 flex-col items-center gap-1 active:scale-95"
          >
            <div className="relative">
              <HotRing
                gradient={avatarGradientFor(person.imageUrl)}
                posts={sortedPosts}
                now={now}
                seen={seen}
                seenPostIds={seenPostIds}
              />
              {!seen && remainingMs < 2 * HOURS && (
                // Bright fire-yellow (--hot-c) rather than the usual danger
                // red.
                <span
                  className="absolute -top-1 right-0 rounded-full px-1 py-[1px] font-nunito text-[7px] font-extrabold text-white shadow-sm"
                  style={{ backgroundColor: "var(--hot-c)", boxShadow: "0 1px 4px rgba(255, 193, 7, 0.5)" }}
                >
                  {formatRemaining(remainingMs)}
                </span>
              )}
            </div>
            <span className="max-w-[50px] truncate font-nunito text-[9.5px] font-semibold text-ink">
              {person.avitag}
            </span>
          </button>
        ))}
      </div>
      )}

      <EDeyHotComposer open={composerOpen} onClose={() => setComposerOpen(false)} />

      <EDeyHotViewer
        open={viewerIndex !== null}
        people={viewerPeople}
        initialIndex={viewerIndex ?? 0}
        now={now}
        seenPostIds={seenPostIds}
        onPostViewed={markPostSeen}
        onClose={() => {
          setViewerIndex(null);
          void flushSeen();
        }}
      />

      <EDeyHotViewer
        open={ownViewerOpen}
        people={ownViewerPeople}
        initialIndex={0}
        now={now}
        seenPostIds={seenPostIds}
        onPostViewed={markPostSeen}
        onClose={() => {
          setOwnViewerOpen(false);
          void flushSeen();
        }}
        // Steps out of viewing and straight into composing — the "+" in
        // the viewer's own header is the whole reason this prop exists.
        onAddAnother={() => {
          setOwnViewerOpen(false);
          openComposer();
        }}
        onDeletePost={(id) => void deletePost(id)}
      />

      <HotExplainerModal
        open={explainerOpen}
        onClose={() => {
          setExplainerOpen(false);
          setComposerOpen(true);
        }}
        onDontShowAgain={() => {
          dismissHotExplainerForever();
          setExplainerOpen(false);
          setComposerOpen(true);
        }}
      />
    </div>
  );
}
