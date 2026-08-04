import type { AuthGateState } from "@/stores/authStore";

/** Where a user in a given state belongs by default — used both by the
 * gate (to bounce someone off a page they don't belong on) and by
 * login/signup/etc. after a successful action (so routing decisions live
 * in exactly one place instead of being hardcoded per page). */
export function destinationFor(state: AuthGateState): string {
  switch (state) {
    case "guest":
      return "/login";
    case "needs-otp":
      return "/verify-otp";
    case "needs-profile":
      return "/setup-profile";
    case "active":
      return "/feed";
    case "unknown":
      return "/login";
  }
}
