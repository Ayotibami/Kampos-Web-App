/**
 * Holds the just-registered credentials in memory during the signup → OTP flow,
 * so we can auto-log-in the user right after they verify. This is the web-safe
 * replacement for the mobile app's SecureStore password stash: it lives only in
 * memory, is never persisted to disk/localStorage, and is wiped after use.
 */
interface PendingSignup {
  email: string;
  password: string;
}

let pending: PendingSignup | null = null;

export function setPendingSignup(value: PendingSignup): void {
  pending = value;
}

export function getPendingSignup(): PendingSignup | null {
  return pending;
}

export function clearPendingSignup(): void {
  pending = null;
}
