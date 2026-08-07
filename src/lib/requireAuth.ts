import { useAuthStore } from "@/stores/authStore";
import { useAuthPromptStore } from "@/stores/authPromptStore";

/**
 * The one gate for anything that needs a real session — reacting,
 * commenting, posting, reporting, editing, deleting. Returns true if
 * there's a logged-in user (caller proceeds normally); otherwise shows the
 * shared signup/login prompt and returns false, so the caller can bail out
 * *before* touching any local/optimistic state, not just before the
 * network call.
 *
 * A plain function, not a hook — safe to call from inside a click handler
 * or another callback without violating the rules of hooks.
 *
 * `label` becomes "Sign up to {label}" in the prompt — keep it a short verb
 * phrase, e.g. "react to gists", "leave a comment".
 */
export function requireAuth(label: string): boolean {
  const { user } = useAuthStore.getState();
  if (user) return true;
  useAuthPromptStore.getState().prompt(label);
  return false;
}
