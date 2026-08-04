/**
 * Local-only "has this browser seen the onboarding carousel" flag — no
 * backend involved, same pattern as the theme preference (kampos-theme).
 */
const STORAGE_KEY = "kampos.onboarding-seen";

export function hasSeenOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* storage unavailable — worst case they see onboarding again next visit */
  }
}
