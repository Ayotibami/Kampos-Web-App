"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { GistStack } from "@/components/gist/GistStack";
import { CommentPanel } from "@/components/comment/CommentPanel";
import { Avatar } from "@/components/ui/Avatar";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/authStore";
import { useGistStore } from "@/stores/gistStore";
import type { GistContext } from "@/lib/serverGist";
import type { Gist } from "@/types";

/**
 * The guest-facing shared-link page: the exact gist someone shared, with
 * chronological neighbors either side to browse into — no gate, no compose
 * UI, no settings. Every real action (react/comment/report/...) still
 * renders normally either way; a logged-out tap on one shows the shared
 * signup prompt instead of silently failing (see requireAuth, wired inside
 * GistCard/CommentPanel themselves, not here).
 */
export function GistShareView({ context }: { context: GistContext }) {
  const myImageUrl = useAuthStore(
    (s) => (s.profiles.find((p) => p.avitag === s.avitag)?.image_url as string | undefined) ?? null,
  );
  const isLoggedIn = useAuthStore((s) => !!s.user);

  // Feed convention: index 0 is the newest gist, increasing index moves
  // older — matches how the main feed already orders things, so "swipe
  // forward" means the same thing in both places. `after` (newer than the
  // target) comes back oldest-first from the backend, so it's reversed to
  // put the newest of that group at the very front; `before` (older) is
  // already newest-first as-is. Computed once into real local state (not a
  // useMemo derived from the prop) specifically so live counts/moderation
  // events below have something they can actually patch — a memoized value
  // can't be mutated in place, and this page needs to react to both.
  const [orderedGists, setOrderedGists] = useState<Gist[]>(() => [
    ...context.after.slice().reverse(),
    context.target,
    ...context.before,
  ]);
  // The starting position only — doesn't need to stay in sync with live
  // updates, it's just where GistStack opens.
  const [initialIndex] = useState(() => context.after.length);

  const [current, setCurrent] = useState<Gist | undefined>(context.target);
  const currentRemoved = current?.gist_status === "REJECTED";

  // Live counts (reactions/comments/views from other people's activity)
  // and live moderation removal — same broadcasts FeedContent/ProfileView
  // react to, but this page's own idea of "removed" is different from
  // theirs: they drop the gist from view entirely (it was never meant to
  // be there once rejected), while this page is the one place a REJECTED
  // gist is actually expected to be reachable at all (see the page-level
  // doc comment on the ungated /gist/[gistId] route for why) — so here it
  // flips gist_status in place instead, letting GistCard's own existing
  // REJECTED-placeholder rendering take over rather than vanishing from
  // the stack mid-browse.
  useEffect(() => {
    const onCounts = (e: Event) => {
      const { gist_id, counts } = (e as CustomEvent<{ gist_id: string; counts: Partial<Gist["counts"]> }>).detail;
      setOrderedGists((prev) =>
        prev.map((g) => (g.gist_id === gist_id ? { ...g, counts: { ...g.counts, ...counts } as Gist["counts"] } : g)),
      );
      setCurrent((prev) =>
        prev && prev.gist_id === gist_id
          ? { ...prev, counts: { ...prev.counts, ...counts } as Gist["counts"] }
          : prev,
      );
    };
    const onRejected = (e: Event) => {
      const { gist_id } = (e as CustomEvent<{ gist_id: string }>).detail;
      setOrderedGists((prev) =>
        prev.map((g) => (g.gist_id === gist_id ? { ...g, gist_status: "REJECTED" } : g)),
      );
      setCurrent((prev) => (prev && prev.gist_id === gist_id ? { ...prev, gist_status: "REJECTED" } : prev));
    };
    window.addEventListener("kampos:gist-counts-updated", onCounts);
    window.addEventListener("kampos:gist-rejected", onRejected);
    return () => {
      window.removeEventListener("kampos:gist-counts-updated", onCounts);
      window.removeEventListener("kampos:gist-rejected", onRejected);
    };
  }, []);

  // Same signal FeedContent/ProfileView listen for — an offline-queue
  // flush just landed one or more real reacts/comments on the server, and
  // this page isn't guaranteed to have caught the resulting counts:updated
  // broadcast itself (a long offline stretch can leave the WS socket's own
  // reconnect lagging behind the network coming back). Re-fetches every
  // gist currently loaded in the stack directly rather than relying on
  // that broadcast alone. `orderedGistsRef` mirrors state without needing
  // it as a dependency, so this stays a stable, one-time subscription
  // instead of re-subscribing on every live patch to the list.
  const orderedGistsRef = useRef(orderedGists);
  orderedGistsRef.current = orderedGists;
  useEffect(() => {
    const onSynced = () => {
      const { get } = useGistStore.getState();
      Promise.all(
        orderedGistsRef.current.map((g) => get(g.gist_id).catch(() => undefined)),
      ).then((fresh) => {
        const byId = new Map(fresh.filter((f): f is Gist => !!f).map((f) => [f.gist_id, f]));
        setOrderedGists((prev) =>
          prev.map((g) => {
            const match = byId.get(g.gist_id);
            return match ? { ...g, counts: match.counts } : g;
          }),
        );
        setCurrent((prev) => {
          const match = prev && byId.get(prev.gist_id);
          return match ? { ...prev!, counts: match.counts } : prev;
        });
      });
    };
    window.addEventListener("kampos:gists-synced", onSynced);
    return () => window.removeEventListener("kampos:gists-synced", onSynced);
  }, []);

  // Log a real view (POST /gists/:id/view, unauthenticated-friendly — this
  // page is the guest-facing shared-link entry point) every time the gist
  // actually in focus in the stack changes, not just on first load — a
  // stranger who follows a link into gist #5 and swipes through #6, #7...
  // is genuinely viewing each of those too. This is also what makes the
  // backend fire its counts:updated broadcast, so the view count ticks up
  // live for anyone else watching the same gist (see gistStore's own
  // counts:updated subscription for the receiving end of that).
  //
  // lastLoggedRef guards against StrictMode's dev-only double-invoke of
  // this effect on mount (mount → cleanup → mount again, same gist_id
  // both times) — without it, every first view of the page double-counts
  // in development. Comparing against "the last id we actually logged"
  // rather than a growing set still lets a genuine later revisit (swipe
  // away and back) log again, since something else will have logged in
  // between.
  const lastLoggedGistIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!current?.gist_id) return;
    if (lastLoggedGistIdRef.current === current.gist_id) return;
    lastLoggedGistIdRef.current = current.gist_id;
    void useGistStore.getState().view(current.gist_id);
  }, [current?.gist_id]);

  return (
    <AppShell variant="feed">
      <div className="flex h-dvh w-full overflow-hidden">
        <div className="relative flex h-full min-w-0 flex-1 flex-col bg-brand/[0.04] dark:bg-brand/[0.07]">
          <header className="sticky top-0 z-10 w-full shrink-0 border-b border-line bg-surface/85 backdrop-blur-md">
            <div className="mx-auto flex max-w-[740px] items-center justify-between px-4 py-2.5 sm:px-6">
              <Wordmark accentClassName="text-brand" className="text-lg sm:text-xl" />
              {isLoggedIn ? (
                <Link
                  href="/feed"
                  aria-label="Back to feed"
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-line transition hover:ring-brand"
                >
                  <Avatar src={myImageUrl} />
                </Link>
              ) : (
                <div className="flex items-center gap-2">
                  <Link href="/login">
                    <Button variant="secondary" fullWidth={false} className="!px-4 !py-2 !text-sm">
                      Log in
                    </Button>
                  </Link>
                  <Link href="/signup">
                    <Button variant="primary" fullWidth={false} className="!px-4 !py-2 !text-sm">
                      Sign up
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </header>

          <div className="relative z-10 flex min-h-0 flex-1 w-full">
            <GistStack gists={orderedGists} initialIndex={initialIndex} onCurrentChange={setCurrent} />
          </div>
        </div>

        <div className="hidden h-full w-[360px] shrink-0 md:block">
          {currentRemoved ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 border-l border-line px-6 text-center">
              <p className="font-nunito text-sm font-semibold text-muted">
                Comments aren&apos;t available on a removed gist.
              </p>
            </div>
          ) : (
            <CommentPanel gist={current} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
