import { create } from "zustand";
import type { Gist, Profile } from "@/types";

/**
 * Mirrors gistStore's own feedSnapshot — same reasoning, same TTL, applied
 * to a profile page instead of the feed. Keyed by avitag rather than a
 * single global slot, since (unlike the one feed) someone can genuinely
 * have several different profiles' worth of recent state worth restoring
 * (bouncing between a couple of profiles, or repeatedly re-checking your
 * own via the "You" tab).
 *
 * Purely in-memory, not persisted — same as feedSnapshot, this only needs
 * to survive a client-side navigation away and back within the same tab,
 * not a hard reload. Never trusted past its own age (see
 * getFreshProfileSnapshot) and — same as feedSnapshot — this is about
 * showing SOMETHING real instantly while the actual server-rendered page
 * (always fetched fresh, this cache doesn't touch that) settles in behind
 * it, not about serving genuinely stale data as if it were current.
 */
interface ProfileSnapshot {
  profile: Profile;
  isOwnProfile: boolean;
  gists: Gist[];
  gistTotal: number;
  savedAt: number;
}

interface ProfileSnapshotState {
  snapshots: Record<string, ProfileSnapshot>;
  saveProfileSnapshot: (
    avitag: string,
    snapshot: Omit<ProfileSnapshot, "savedAt">,
  ) => void;
}

// Matches FEED_SNAPSHOT_TTL_MS (gistStore.ts) and the 5-minute window the
// server-side auth cache (serverAuth.ts's gateServerForTabs) already uses
// for these same three bottom-tab routes — one consistent "how stale is
// tolerable" number across all of it, not three independently-chosen ones.
export const PROFILE_SNAPSHOT_TTL_MS = 5 * 60 * 1000;

/** Reads a snapshot for one avitag, but only if still within
 * PROFILE_SNAPSHOT_TTL_MS — a stale one is treated exactly like no
 * snapshot at all by every caller. Plain function, not a hook — every call
 * site only ever needs this once, at mount/decision time, not a live
 * subscription. */
export function getFreshProfileSnapshot(avitag: string): ProfileSnapshot | null {
  const snap = useProfileSnapshotStore.getState().snapshots[avitag];
  if (!snap) return null;
  if (Date.now() - snap.savedAt > PROFILE_SNAPSHOT_TTL_MS) return null;
  return snap;
}

export const useProfileSnapshotStore = create<ProfileSnapshotState>((set) => ({
  snapshots: {},
  saveProfileSnapshot: (avitag, snapshot) =>
    set((s) => ({
      snapshots: { ...s.snapshots, [avitag]: { ...snapshot, savedAt: Date.now() } },
    })),
}));
