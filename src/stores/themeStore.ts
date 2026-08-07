import { create } from "zustand";

export type Theme = "light" | "dark";

const STORAGE_KEY = "kampos-theme";

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function persist(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

/**
 * The user's saved theme *preference* — not necessarily what's currently
 * rendered. Dark mode only ever actually applies to the DOM on the main,
 * post-auth app surface (feed/profile/settings — see ThemeRouteSync in the
 * root layout); everywhere else (login, signup, welcome, onboarding,
 * setup-profile, password reset) always renders light regardless of this
 * value. So toggling here only updates the stored preference — it
 * deliberately never touches `document.documentElement` itself, leaving
 * that entirely to ThemeRouteSync, which is the one place that also knows
 * which route is currently active.
 */
export const useThemeStore = create<ThemeState>((set) => ({
  theme: readInitialTheme(),
  setTheme: (theme) => {
    persist(theme);
    set({ theme });
  },
  toggle: () =>
    set((s) => {
      const next: Theme = s.theme === "dark" ? "light" : "dark";
      persist(next);
      return { theme: next };
    }),
}));
