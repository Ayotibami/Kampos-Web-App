import { create } from "zustand";

interface AuthPromptState {
  open: boolean;
  /** Shown in the modal — what the guest was trying to do, e.g. "react to
   * gists" — so the prompt reads as specific ("Sign up to react to gists")
   * rather than a generic "please log in" wall. */
  action?: string;
  prompt: (action?: string) => void;
  close: () => void;
}

/**
 * Global, single-instance modal state for "you need an account to do that."
 * Mounted once (see AuthPromptModal in the root layout) so any component —
 * deep inside GistCard, CommentPanel, wherever — can trigger it via
 * requireAuth() without prop-drilling a callback down through every layer.
 */
export const useAuthPromptStore = create<AuthPromptState>((set) => ({
  open: false,
  action: undefined,
  prompt: (action) => set({ open: true, action }),
  close: () => set({ open: false }),
}));
