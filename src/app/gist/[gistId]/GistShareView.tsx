"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { GistStack } from "@/components/gist/GistStack";
import { CommentPanel } from "@/components/comment/CommentPanel";
import { Avatar } from "@/components/ui/Avatar";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/authStore";
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
  // already newest-first as-is.
  const { orderedGists, initialIndex } = useMemo(() => {
    const combined: Gist[] = [...context.after.slice().reverse(), context.target, ...context.before];
    return { orderedGists: combined, initialIndex: context.after.length };
  }, [context]);

  const [current, setCurrent] = useState<Gist | undefined>(context.target);
  const currentRemoved = current?.gist_status === "REJECTED";

  return (
    <AppShell variant="feed">
      <div className="flex h-dvh w-full overflow-hidden">
        <div className="relative flex h-full flex-1 flex-col bg-brand/[0.04] dark:bg-brand/[0.07]">
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
              <p className="font-poppins text-sm font-semibold text-muted">
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
