"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { Check, RefreshCw } from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";
import { useProfileStore } from "@/stores/profileStore";
import { useAuthStore } from "@/stores/authStore";
import type { AccountProfileRow } from "@/lib/serverUsers";

/** Same 5-slot categorical order/hexes already validated (dataviz skill's
 * validate_palette.js) for the HQ dashboard's profiles-by-type chart — a
 * profile type means the same color everywhere in the admin panel, not a
 * new palette invented per screen. Scoped locally (not global tokens),
 * same pattern HqDashboard.tsx's own `.hq-viz` block uses, since these
 * slots exist only for identity-by-type, nothing else on this page needs
 * them. Dark values swap via `.dark` (this app's actual dark-mode
 * mechanism — a plain class on <html>, confirmed against globals.css —
 * NOT the generic data-theme/prefers-color-scheme pattern). */
const STYLE = `
.profile-switcher {
  --switcher-student: #2a78d6;
  --switcher-kreator: #eb6834;
  --switcher-kompany: #1baf7a;
  --switcher-school: #eda100;
  --switcher-idiot: #e87ba4;
}
.dark .profile-switcher {
  --switcher-student: #3987e5;
  --switcher-kreator: #d95926;
  --switcher-kompany: #199e70;
  --switcher-school: #c98500;
  --switcher-idiot: #d55181;
}
`;

const TYPE_COLOR_VAR: Record<string, string> = {
  student: "var(--switcher-student)",
  kreator: "var(--switcher-kreator)",
  kompany: "var(--switcher-kompany)",
  school: "var(--switcher-school)",
  idiot: "var(--switcher-idiot)",
};

/**
 * A row of circular profile avatars — tap one to make it your active
 * profile everywhere in Kampos, not just here. Google/Slack-style account
 * switcher, replacing the earlier version's plain "Switch to this profile"
 * text link buried inside each full profile card below (this strip now
 * owns switching entirely; ProfileCard no longer renders any switch UI of
 * its own, so there's exactly one place to do it, not two).
 *
 * The active ring is a SINGLE `motion.div` with a shared `layoutId` —
 * only the currently-active avatar ever renders it, so when the active
 * profile changes, Framer Motion sees that same layoutId re-mount under a
 * different parent and automatically animates the ring sliding from the
 * old position to the new one (the same technique an iOS segmented-control
 * or a tab-underline indicator uses), rather than the ring just popping in
 * and out at two different spots.
 *
 * switchProfile (profileStore.ts) already existed and already worked
 * (POST /auth/switch-profile rotates the session's tokens with the new
 * profile's claims) — this is its first real UI anywhere in the app.
 */
export function ProfileSwitcherStrip({
  profiles,
  onError,
}: {
  profiles: AccountProfileRow[];
  onError: (message: string) => void;
}) {
  const activeAvitag = useAuthStore((s) => s.avitag);
  const switchProfile = useProfileStore((s) => s.switchProfile);
  const [switchingAvitag, setSwitchingAvitag] = useState<string | null>(null);
  const [justSwitchedName, setJustSwitchedName] = useState<string | null>(null);

  // Nothing to switch BETWEEN with only one (or zero) profiles — the strip
  // would just be a single unclickable circle, pure clutter.
  if (profiles.length < 2) return null;

  const handleSwitch = async (profile: AccountProfileRow) => {
    if (profile.avitag === activeAvitag || switchingAvitag) return;
    setSwitchingAvitag(profile.avitag);
    try {
      await switchProfile(profile.avitag);
      setJustSwitchedName(profile.display_name || `@${profile.avitag}`);
      window.setTimeout(() => setJustSwitchedName(null), 2600);
    } catch (err) {
      onError(apiErrorMessage(err, "Failed to switch profile"));
    } finally {
      setSwitchingAvitag(null);
    }
  };

  return (
    <div className="profile-switcher rounded-2xl border border-line/70 p-4">
      <style>{STYLE}</style>
      <div className="mb-3 flex h-5 items-center justify-between">
        <p className="font-nunito text-xs font-bold uppercase tracking-wide text-faint">Switch profile</p>
        {/* Inline confirmation, same dark-pill/checkmark visual language as
            GistActionToast's own "success" toast — not that shared,
            globally-mounted, gist-scoped component itself (wrong semantic
            scope for a profile switch), just its established look, so this
            still feels native to the app rather than inventing a new
            feedback style. */}
        <AnimatePresence>
          {justSwitchedName && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.94 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="flex items-center gap-1.5 rounded-full bg-[#171a1f] py-1 pl-1 pr-3"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#6eed94]/20">
                <Check size={9} strokeWidth={3.2} color="#6eed94" />
              </span>
              <span className="truncate font-nunito text-[11px] font-bold text-white/95">
                Switched to {justSwitchedName}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* px-1 py-2 (not just pb-1) — the active ring extends 3px past each
          avatar's own box (`-inset-[3px]` below), and `overflow-x-auto`
          here computes overflow-y to `auto` too (the CSS spec's "one axis
          auto forces the other" rule), so without room INSIDE this
          scrollable box the ring's own top/side edges get clipped flush
          against it instead of floating clear, reading as the avatars
          "bumping" the container. */}
      <div className="flex gap-5 overflow-x-auto px-1 py-2">
        {profiles.map((profile) => {
          const isActive = profile.avitag === activeAvitag;
          const isSwitching = switchingAvitag === profile.avitag;
          const typeColor = TYPE_COLOR_VAR[profile.profile_type] ?? "var(--color-brand)";
          return (
            <button
              key={profile.avitag}
              type="button"
              onClick={() => void handleSwitch(profile)}
              disabled={switchingAvitag !== null}
              aria-label={isActive ? `${profile.display_name || profile.avitag} (active)` : `Switch to ${profile.display_name || profile.avitag}`}
              className="flex shrink-0 flex-col items-center gap-1.5 disabled:cursor-not-allowed"
            >
              <div className="relative h-16 w-16">
                {isActive && (
                  <motion.div
                    layoutId="profile-switcher-active-ring"
                    className="absolute -inset-[3px] rounded-full"
                    style={{ boxShadow: `0 0 0 2.5px ${typeColor}` }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full bg-brand/10 ring-2 ring-surface">
                  <Avatar src={profile.image_url} />
                </div>
                {isSwitching && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                    <RefreshCw className="h-5 w-5 animate-spin text-white" />
                  </div>
                )}
                {/* Type-identity dot — the same color, everywhere in the
                    panel, a profile of this type is ever shown in. */}
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full ring-2 ring-surface"
                  style={{ backgroundColor: typeColor }}
                  aria-hidden
                />
              </div>
              <p
                className={`max-w-[76px] truncate font-nunito text-[11px] ${
                  isActive ? "font-bold text-ink" : "font-medium text-muted"
                }`}
              >
                {profile.display_name || `@${profile.avitag}`}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
