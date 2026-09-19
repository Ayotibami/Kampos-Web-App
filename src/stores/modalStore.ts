import { create } from "zustand";

/**
 * One shared "is any modal/sheet currently open" flag, not something every
 * autoplaying video independently has to know how to check on its own.
 *
 * Video autoplay (GistMediaGrid.tsx) is driven by IntersectionObserver or
 * a stack's own `active` prop — neither of which has any idea a Modal
 * (Modal.tsx) has since opened ON TOP of it. Geometrically the video is
 * still "in view"/"the active card," so without this it just keeps
 * playing (and, once unmuted, keeps making sound) underneath a compose
 * sheet, comment sheet, report modal, or any of the dozen other dialogs
 * built on the same shared Modal component.
 *
 * A COUNT, not a boolean — a modal can open another modal on top of it
 * (e.g. CreateGistSheet's own GiphyPicker, or a ConfirmModal opened from
 * inside a sheet), and the outer one is still open when the inner one
 * closes. Only hitting zero means truly nothing is open anymore.
 *
 * Deliberately NOT wired into GistMediaOverlay (the full-screen tap-to-
 * view media overlay) — that one isn't built on the shared Modal
 * component, and on purpose: opening it to WATCH a video is the one case
 * where autoplay pausing on "a modal opened" would be exactly backwards.
 */
interface ModalState {
  openCount: number;
  modalOpened: () => void;
  modalClosed: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  openCount: 0,
  modalOpened: () => set((s) => ({ openCount: s.openCount + 1 })),
  modalClosed: () => set((s) => ({ openCount: Math.max(0, s.openCount - 1) })),
}));

export const useAnyModalOpen = () => useModalStore((s) => s.openCount > 0);
