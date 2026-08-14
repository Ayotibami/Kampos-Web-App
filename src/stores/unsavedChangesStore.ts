import { create } from "zustand";

type NavigationGuard = (proceed: () => void) => void;

interface UnsavedChangesState {
  guard: NavigationGuard | null;
  setGuard: (guard: NavigationGuard | null) => void;
}

/**
 * Lets a page with an in-progress, unsaved form (Profile Settings) intercept
 * navigation triggered by shared chrome it doesn't own — SettingsHeader's
 * back arrow, SettingsRail's links — without those components needing to
 * know anything about any specific page's form state. The owning page
 * registers a guard function while it has unsaved changes and clears it
 * once saved/discarded or on unmount; navigation triggers call
 * `runGuardedNavigation` instead of navigating directly.
 */
export const useUnsavedChangesStore = create<UnsavedChangesState>((set) => ({
  guard: null,
  setGuard: (guard) => set({ guard }),
}));

/** No guard registered (or nothing unsaved) → navigates immediately.
 * Otherwise defers to the guard to decide (show a confirm modal, etc). */
export function runGuardedNavigation(proceed: () => void) {
  const { guard } = useUnsavedChangesStore.getState();
  if (guard) guard(proceed);
  else proceed();
}
