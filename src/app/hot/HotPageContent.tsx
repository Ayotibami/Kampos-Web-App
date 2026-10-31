"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ChevronLeft } from "@/components/ui/icons";
import { useAuthStore } from "@/stores/authStore";
import { useHotStore, type HotPost } from "@/stores/hotStore";
import { EDeyHotComposer } from "@/components/gist/EDeyHotComposer";
import { EDeyHotViewer, type ViewerPerson } from "@/components/gist/EDeyHotViewer";
import { HotExplainerModal, hotExplainerDismissed, dismissHotExplainerForever } from "@/components/gist/HotExplainerModal";

const FALLBACK_AVATAR_GRADIENT = "linear-gradient(135deg, var(--brand-light), var(--brand))";
function avatarGradientFor(imageUrl: string | null): string {
  return imageUrl ? `url("${imageUrl}")` : FALLBACK_AVATAR_GRADIENT;
}

function toViewerPosts(posts: HotPost[]) {
  return [...posts]
    .sort((a, b) => a.expiresAt - b.expiresAt)
    .map((p) => ({
      id: p.id,
      text: p.text ?? "",
      createdAt: p.createdAt,
      mediaUrl: p.mediaUrl,
      mediaKind: p.type === "text" ? null : p.type,
      colorKey: p.colorKey,
      thumbnailUrl: p.thumbnailUrl,
    }));
}

/** A full-screen, black loading state while hotStore's own fetch is in
 * flight — same single-ring-in-the-center idea EDeyHotRail's own skeleton
 * rings use, just one, centered, since this page only ever needs to show
 * loading for the one person it's about to open. */
function HotPageLoading() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-black">
      <div
        className="hot-ring-live h-14 w-14 rounded-full"
        style={
          {
            backgroundImage: "conic-gradient(var(--hot-c), var(--hot-b), var(--hot-a), var(--hot-b), var(--hot-c))",
            "--hot-spin-dur": "3s",
            "--hot-flicker-sat": 1.2,
            "--hot-flicker-bright": 1.15,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

/** Shown when the requested stack has nothing live left in it — the post(s)
 * expired between whoever linked here and the tap actually landing (Hot's
 * whole premise is a 24h window, so this is an expected, not exceptional,
 * outcome), or `avitag` doesn't resolve to anyone in your own circle at
 * all. `isOwn` swaps the copy and offers a direct "post something" CTA,
 * since that's a real next action for your OWN empty stack; everyone
 * else's just offers to go back. */
function HotGoneState({ isOwn, onBack, onCompose }: { isOwn: boolean; onBack: () => void; onCompose: () => void }) {
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 bg-black px-8 text-center">
      <span className="text-4xl" aria-hidden>
        🔥
      </span>
      <p className="font-nunito text-[15px] font-bold text-white">
        {isOwn ? "You've got nothing hot up right now" : "This one's gone — it already burned out"}
      </p>
      <p className="font-nunito text-[12.5px] text-white/55">
        {isOwn ? "Posts here only last 24 hours." : "As e dey hot posts disappear after 24 hours."}
      </p>
      {isOwn ? (
        <button
          type="button"
          onClick={onCompose}
          className="mt-1 rounded-full bg-brand px-5 py-2.5 font-nunito text-[13px] font-extrabold text-white"
        >
          Post something hot
        </button>
      ) : (
        <button
          type="button"
          onClick={onBack}
          className="mt-1 flex items-center gap-1.5 rounded-full bg-white/10 px-5 py-2.5 font-nunito text-[13px] font-extrabold text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
      )}
    </div>
  );
}

function HotPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedAvitag = searchParams.get("avitag");

  const myAvitag = useAuthStore((s) => s.avitag);
  const myImageUrl = useAuthStore(
    (s) => (s.profiles.find((p) => p.avitag === s.avitag)?.image_url as string | undefined) ?? null,
  );

  const myPosts = useHotStore((s) => s.myPosts);
  const feed = useHotStore((s) => s.feed);
  const loaded = useHotStore((s) => s.loaded);
  const fetchAll = useHotStore((s) => s.fetchAll);
  const markSeen = useHotStore((s) => s.markSeen);
  const flushSeen = useHotStore((s) => s.flushSeen);
  const deletePost = useHotStore((s) => s.deletePost);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [composerOpen, setComposerOpen] = useState(false);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const openComposer = () => {
    if (hotExplainerDismissed()) setComposerOpen(true);
    else setExplainerOpen(true);
  };

  const isOwn = !!requestedAvitag && requestedAvitag === myAvitag;

  // Same "soonest-expiring first, drop anyone with nothing live left"
  // shape EDeyHotRail's own `rings`/`viewerPeople` memo builds — duplicated
  // rather than shared, since EDeyHotRail needs the richer per-ring display
  // data (gradients, remaining-time badges) this page has no use for, and
  // this page needs the ViewerPerson shape EDeyHotRail has no use for.
  const otherPeople: ViewerPerson[] = useMemo(
    () =>
      feed
        .map((person) => ({ person, live: person.posts.filter((p) => p.expiresAt > now) }))
        .filter(({ live }) => live.length > 0)
        .map(({ person, live }) => ({
          avitag: person.avitag,
          firstName: person.firstName,
          avatarGradient: avatarGradientFor(person.imageUrl),
          campusTag: person.campusTag ?? undefined,
          majorTag: person.majorTag ?? undefined,
          level: person.level ?? undefined,
          bio: person.bio ?? undefined,
          posts: toViewerPosts(live),
        })),
    [feed, now],
  );

  const liveMyPosts = useMemo(() => myPosts.filter((p) => p.expiresAt > now), [myPosts, now]);
  const ownPeople: ViewerPerson[] = useMemo(
    () => [
      {
        avitag: myAvitag ?? "",
        firstName: "You",
        avatarGradient: avatarGradientFor(myImageUrl),
        posts: toViewerPosts(liveMyPosts),
      },
    ],
    [myAvitag, myImageUrl, liveMyPosts],
  );

  const people = isOwn ? ownPeople : otherPeople;
  // Pure derivation, not stored state — recomputed fresh every render
  // directly from the URL + whatever hotStore currently holds. Deliberately
  // NOT a useEffect-plus-ref one-shot-consume pattern (the shape the old
  // Feed-embedded version of this needed, and which took a Strict-Mode
  // double-invoke bug, a Router-Cache-reuse bug, and an identical-value
  // React bail-out bug to get right) — there's nothing here to "consume
  // once," so there's no one-shot machinery left to get wrong. Revisiting
  // this exact URL, even on a reused cached instance, just recomputes the
  // same answer; a genuinely different `avitag` recomputes a different one.
  // EDeyHotViewer's own openKey/personKey blocks (see its doc comments)
  // already handle resetting position from a changed initialIndex the same
  // derived-during-render way — nothing new needed on this end either.
  const initialIndex = isOwn ? 0 : people.findIndex((p) => p.avitag === requestedAvitag);
  const hasContent = isOwn ? liveMyPosts.length > 0 : initialIndex !== -1;

  const handleBack = () => router.back();

  if (!loaded) return <HotPageLoading />;

  if (!requestedAvitag || !hasContent) {
    return (
      <>
        <HotGoneState isOwn={isOwn} onBack={handleBack} onCompose={openComposer} />
        <EDeyHotComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
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
      </>
    );
  }

  return (
    <>
      <EDeyHotViewer
        open
        people={people}
        initialIndex={initialIndex}
        now={now}
        seenPostIds={new Set([...myPosts, ...feed.flatMap((p) => p.posts)].filter((p) => p.seen).map((p) => p.id))}
        onPostViewed={markSeen}
        onClose={() => {
          void flushSeen();
          handleBack();
        }}
        onAddAnother={isOwn ? openComposer : undefined}
        onDeletePost={isOwn ? (id) => void deletePost(id) : undefined}
      />
      <EDeyHotComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
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
    </>
  );
}

/**
 * The "As e dey hot" story viewer as its own real route — `?avitag=<who>`
 * says whose stack to open, read once per navigation via useSearchParams
 * and derived straight into what EDeyHotViewer renders (see HotPageInner's
 * own doc comment on `initialIndex` for why this needed none of the
 * one-shot-consume machinery its old Feed-embedded home did).
 *
 * This used to be a modal living inside EDeyHotRail, itself living inside
 * the Feed page — which meant "open person X's stack" from a notification
 * meant navigating to Feed, waiting for its own data fetch, then reaching
 * into a nested component's local state to flip it open. That chain needed
 * a query param, an effect to consume it, a ref guard against React Strict
 * Mode's double-invoke cancelling a deferred setState, a nonce to defeat
 * React bailing out on an identical state value, and still broke on a
 * cached/reused Feed instance. None of that was inherent to "open a Hot
 * post" — it was all overhead from the viewer not having its own address.
 * A real route fixes every one of those at the root: this IS the
 * navigation, not a side effect bolted onto a different one.
 */
export function HotPageContent() {
  return (
    <AppShell variant="feed">
      <Suspense fallback={<HotPageLoading />}>
        <HotPageInner />
      </Suspense>
    </AppShell>
  );
}
