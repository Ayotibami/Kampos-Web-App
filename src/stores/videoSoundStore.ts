import { create } from "zustand";

/**
 * One shared "is sound on" flag for every video in the app, not something
 * each video tracks independently.
 *
 * Browsers require autoplay to start muted, so the very first video to
 * autoplay still always starts silent — nothing here changes that. What
 * this replaces is every video AFTER that one needing its own separate
 * unmute tap as you keep scrolling: the moment any video gets unmuted,
 * this flips to `false` and every other video — the one currently
 * playing, and whichever one autoplays next — follows it automatically.
 * Muting any one video flips it back to `true`, silencing the rest the
 * same way. One switch for the whole feed, not one per video.
 */
interface VideoSoundState {
  muted: boolean;
  setMuted: (muted: boolean) => void;
}

export const useVideoSoundStore = create<VideoSoundState>((set) => ({
  muted: true,
  setMuted: (muted) => set({ muted }),
}));
