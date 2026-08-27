"use client";

/**
 * Floating pill that appears above the gist feed when a background refresh
 * has silently fetched new gists. Tapping it swaps the stale cached list
 * for the fresh one — no loading, instant.
 *
 * A true viewport-fixed overlay, not sticky — it floats above the header
 * and cards instead of taking up space in the layout, so it never pushes
 * anything down when it appears or leaves a gap when it's gone. Mounted/
 * unmounted by AnimatePresence off `hasNewGists` alone (see gistStore's own
 * 15-minute cooldown on how often that can flip back to true after the
 * user's last tap — this component doesn't need to know about that part,
 * it just animates whatever it's handed), so the bounce-in below plays
 * once per genuine appearance, never on a re-render while already shown.
 *
 * Portalled to document.body, same reasoning as Modal.tsx's own portal:
 * FeedContent renders this inside a `position: relative` + `z-index`
 * wrapper (the gists container), which establishes its own stacking
 * context — any z-index set on a descendant, no matter how high, only
 * ever competes with siblings *inside* that same context, never with the
 * page header sitting outside it. Without the portal this pill was stuck
 * rendering underneath the header regardless of its own z-index; portalled
 * straight to body, it escapes that trap entirely and z-[70] means what it
 * says relative to the whole page.
 *
 * top-36 (144px), not the old top-[72px] — ConnectivityPill (mounted
 * globally, root layout) sits at top-24/96px with its own z-[1150], well
 * above this pill's z-70. The two are independently triggered (a
 * background refresh landing new gists vs. a connectivity change) and can
 * genuinely coincide, and at the old 72px this pill's own ~40px height put
 * it right in ConnectivityPill's 96–132px band — a real overlap, with
 * ConnectivityPill winning the stacking order and partially covering this
 * one. 144px clears that band with room to spare even if both are visible
 * at once.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { ChevronUp } from "@/components/ui/icons";
import { useGistStore } from "@/stores/gistStore";

// How long the pill sits on screen unread before it quietly disappears on
// its own — long enough to actually notice and react to, short enough that
// it doesn't just sit there indefinitely nagging (or blocking anything
// underneath it) if you'd rather not deal with it right now.
const AUTO_HIDE_MS = 10_000;

export function NewGistsPill({ onLoad }: { onLoad?: () => void }) {
  const hasNewGists = useGistStore((s) => s.hasNewGists);
  const storeLoad = useGistStore((s) => s.loadNewGists);

  // Auto-hide, not auto-act — this never loads the new gists, it just
  // clears hasNewGists the same way ignoring-and-it-goes-away should feel.
  // Runs the LONGER of the two cooldowns (see dismissNewGistsPill's own
  // docstring in gistStore.ts) — not tapping it is a weaker "come back
  // soon" signal than actually engaging with it. Re-arms itself every time
  // hasNewGists flips back to true (a genuinely new appearance) and is
  // cleared early if the pill is tapped (hasNewGists already false by
  // then) or this component unmounts.
  useEffect(() => {
    if (!hasNewGists) return;
    const timer = window.setTimeout(() => {
      useGistStore.getState().dismissNewGistsPill();
    }, AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [hasNewGists]);

  // Unlike Modal.tsx's own `typeof document` guard, this portal's outer
  // wrapper div renders unconditionally once mounted (only the button
  // inside is gated by hasNewGists) — so branching on `typeof document`
  // during render disagreed with the server on the very first client
  // paint: server returns null (no document), client already has
  // `document` and renders the wrapper div for real. Gating on a
  // mount-effect flag instead means the first client render matches the
  // server (both render null); the portal only attaches a tick later,
  // client-side only, which is invisible to the user.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-36 z-[70] flex justify-center">
      <AnimatePresence>
        {hasNewGists && (
          <motion.button
            type="button"
            onClick={() => (onLoad ? onLoad() : storeLoad())}
            initial={{ opacity: 0, y: -22, scale: 0.7 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.85, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 420, damping: 13, mass: 0.7 }}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-[#165abf] py-2.5 pl-3 pr-4 font-nunito text-sm font-semibold text-white shadow-lg shadow-brand/40 ring-1 ring-white/15 backdrop-blur-sm transition active:scale-95"
          >
            {/* A small second, delayed bounce on just the chevron once the
                pill itself has landed — ties the motion to what it means
                ("new stuff is up there") instead of just being decorative,
                without turning into a looping animation that'd nag anyone
                trying to read while it's still on screen. */}
            <motion.span
              initial={{ y: 0 }}
              animate={{ y: [0, -3, 0] }}
              transition={{ delay: 0.45, duration: 0.5, ease: "easeInOut" }}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20"
            >
              <ChevronUp size={13} strokeWidth={3} />
            </motion.span>
            Check out new gists
          </motion.button>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
