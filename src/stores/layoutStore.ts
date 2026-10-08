import { create } from "zustand";

interface LayoutState {
  /** Whether the feed's desktop comment panel is currently open — the one
   * piece of cross-page layout state DesktopSidebar needs (it lives
   * outside FeedContent, rendered globally from the root layout), so it
   * can collapse to icon-only when that panel eats the horizontal room a
   * labeled rail needs, and expand back out everywhere else. FeedContent
   * is the only thing that ever sets this; every other page just reads
   * `false` and stays expanded. */
  desktopCommentsPanelOpen: boolean;
  setDesktopCommentsPanelOpen: (open: boolean) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  desktopCommentsPanelOpen: false,
  setDesktopCommentsPanelOpen: (open) => set({ desktopCommentsPanelOpen: open }),
}));
