/**
 * Session token handling.
 *
 * The backend uses stateless Bearer JWTs, so the browser must hold the token to
 * send it on each request. We keep it in a module variable (fast, synchronous
 * read for the axios interceptor) mirrored to localStorage so it survives a
 * reload. This replaces the mobile app's AsyncStorage-read-per-request.
 *
 * Security note: localStorage is readable by any script on the origin, so this
 * relies on our strict CSP + escaped rendering to keep XSS out. We never log the
 * token and always wipe it fully on logout.
 */

const STORAGE_KEY = "kampos.token";

let inMemoryToken: string | null = null;
let hydrated = false;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Load the token from localStorage into memory once (client-side). */
function hydrate(): void {
  if (hydrated || !isBrowser()) return;
  try {
    inMemoryToken = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    inMemoryToken = null;
  }
  hydrated = true;
}

export function getToken(): string | null {
  if (!hydrated) hydrate();
  return inMemoryToken;
}

export function setToken(token: string | null): void {
  inMemoryToken = token;
  if (!isBrowser()) return;
  try {
    if (token) window.localStorage.setItem(STORAGE_KEY, token);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode) — in-memory still works for the session */
  }
}

export function clearSession(): void {
  setToken(null);
}
