import { create } from "zustand";

const STORAGE_KEY = "kampos-sound-effects";

function readInitial(): boolean {
  if (typeof window === "undefined") return true;
  try {
    // Anything other than an explicit "off" stays on — a brand-new visitor
    // (nothing in storage yet) should hear sound by default, per the
    // designer's whole reason for building this.
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function persist(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    /* storage unavailable — preference still applies for this session */
  }
}

interface SoundState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
}

/**
 * Whether UI sound effects (tap/pop/whoosh/delete — see src/lib/sounds.ts)
 * are on. Read directly via useSoundStore.getState().enabled from
 * playSound() itself, not just from a hook — most call sites are plain
 * event-handler functions, not components, so gating centrally in
 * playSound() means every caller can just fire-and-forget playSound(name)
 * without re-checking this itself.
 */
export const useSoundStore = create<SoundState>((set) => ({
  enabled: readInitial(),
  setEnabled: (enabled) => {
    persist(enabled);
    set({ enabled });
  },
  toggle: () =>
    set((s) => {
      const next = !s.enabled;
      persist(next);
      return { enabled: next };
    }),
}));
