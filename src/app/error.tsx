"use client";

import { useEffect } from "react";
import { Illustration } from "@/components/brand/illustrations";
import { Button } from "@/components/ui/Button";

/**
 * Root error boundary — catches whatever an unexpected render-time
 * exception anywhere under this route tree throws, so a real bug shows
 * this instead of Next's own default crash screen (a raw stack trace in
 * dev, a bare generic page in prod) or a blank white screen. Same brand
 * voice/illustration GiphyPicker and friends already use for "something
 * broke" states — this is just the last-resort, whole-page version of
 * that same idea.
 *
 * Deliberately standalone, not wrapped in AppShell — whatever crashed
 * could have been AppShell itself, so this can't lean on any shared chrome
 * staying intact.
 */
export default function Error({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  /** Clears local error-boundary state and re-renders the children as-is. */
  reset: () => void;
  /** Next 16.2+'s recommended recovery action over `reset` — re-fetches
   * and re-renders the crashed segment instead of just clearing local
   * state, so it can actually recover from a bad fetch, not only a bad
   * render. Falls back to `reset` on an older Next that doesn't pass it. */
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    // The real detail (stack, digest) is for whoever's debugging this, not
    // the person looking at the friendly message below — same reasoning as
    // the backend never putting a raw exception in a response body.
    console.error("[error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      <Illustration name="Kappywithwire" className="h-40 w-auto" />
      <div className="flex flex-col gap-1.5">
        <h1 className="font-nunito text-lg font-extrabold text-ink">
          Wahala dey o
        </h1>
        <p className="max-w-xs font-nunito text-sm italic text-muted">
          Something broke on our end — no be your fault. Give it another try.
        </p>
      </div>
      <div className="mt-2 flex w-full max-w-[260px] flex-col gap-2.5">
        <Button onClick={() => (unstable_retry ?? reset)()}>Try again</Button>
        <Button variant="ghost" onClick={() => (window.location.href = "/feed")}>
          Back to feed
        </Button>
      </div>
    </div>
  );
}
