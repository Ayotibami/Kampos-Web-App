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

const PERMISSION_PROMPT_KEY = "kampos.push-permission-prompt-last-shown";

/** Whether the "turn on notifications" explainer (NotificationPermissionPrompt)
 * has already been shown TODAY on this browser — stores the date it was last
 * shown rather than a one-time flag, so it's deliberately persistent: it
 * comes back every day the feed opens for as long as the user hasn't
 * enabled push (the caller is responsible for the "already subscribed"
 * check — this only tracks the daily cadence). */
export function hasSeenPermissionPromptToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PERMISSION_PROMPT_KEY) === new Date().toDateString();
  } catch {
    return false;
  }
}

export function markPermissionPromptSeenToday(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PERMISSION_PROMPT_KEY, new Date().toDateString());
  } catch {
    /* storage unavailable — worst case it shows again later the same day */
  }
}
