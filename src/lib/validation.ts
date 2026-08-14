/**
 * Input validation — ported verbatim in spirit from the mobile app
 * (SignUp.tsx, setupAvitag.tsx, SetupName.tsx, helperfunctions.jsx) so the web
 * enforces the same rules. Returns arrays of human-friendly messages (pidgin
 * voice kept) or an empty array when valid.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim + strip angle brackets to defang the most obvious injection attempts. */
export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, "");
}

export function validateEmail(email: string): string | null {
  return EMAIL_RE.test(email) ? null : "This email address no correct, abeg check am.";
}

/**
 * One entry per rule, each independently checkable against a live-typed
 * password — this is the shared source of truth for both the plain
 * validatePassword() below (submit-time gating) and the live checklist UI
 * (each rule flips green the instant its own `test` passes, no debounce
 * needed since — unlike email — a password rule's pass/fail never
 * "flickers" while mid-typing the way an incomplete email address does).
 *
 * No space restriction on purpose — a passphrase like "correct horse
 * battery" is stronger and easier to remember than forced-composition
 * gibberish, and blocking spaces actively punishes that. Special-character
 * check accepts anything non-alphanumeric rather than a narrow fixed set
 * (the old @$!%*?#& allowlist rejected perfectly good characters like ^ ~
 * ( ) + _ that a password manager or muscle memory might produce).
 */
export const PASSWORD_RULES: { id: string; label: string; test: (password: string) => boolean }[] = [
  { id: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "lower", label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "upper", label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "number", label: "One number", test: (p) => /[0-9]/.test(p) },
  { id: "special", label: "One special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function validatePassword(password: string): string[] {
  return PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.label);
}

export function passwordsMatch(a: string, b: string): boolean {
  return a === b;
}

const NAME_PART_RE = /^[A-Za-z]+$/;

/** Validates a single name field (first OR last) — used for live,
 * per-field feedback as the user types. Returns null while empty (an empty
 * field isn't "wrong" yet, just incomplete — that's what disables Continue,
 * not a red error). */
export function validateNamePart(value: string, field: "First name" | "Last name"): string | null {
  const v = value.trim().replace(/\s+/g, " ");
  if (!v) return null;
  if (v.length < 3) return `${field} must be at least 3 characters long.`;
  if (!NAME_PART_RE.test(v)) return `${field} can only contain letters (no numbers or symbols).`;
  return null;
}

export function validateName(first: string, last: string): string | null {
  const f = first.trim().replace(/\s+/g, " ");
  const l = last.trim().replace(/\s+/g, " ");
  if (!f || !l) return "Please enter both your first and last names.";
  return validateNamePart(f, "First name") || validateNamePart(l, "Last name");
}

// Matches the standard most social platforms use (X/Twitter, etc): letters,
// numbers, and underscores only — no emoji in the handle itself (emoji are
// fine in a display name, but handles get used in search/mentions/URLs,
// where they cause real friction).
export const AVITAG_MIN = 4;
export const AVITAG_MAX = 15;
const AVITAG_CHARSET_RE = /^[A-Za-z0-9_]+$/;
const HAS_LETTER_RE = /[A-Za-z]/;

// Zero-width characters stripped before validating (U+200B–U+200D, U+FEFF).
const ZERO_WIDTH_RE = new RegExp("[\\u200B-\\u200D\\uFEFF]", "g");

// A profile lives at the root — /avitag, no /profile prefix — so an avitag
// matching one of this app's own top-level route segments would make that
// person's profile permanently unreachable (Next.js always matches the
// static route over the dynamic [avitag] catch-all). Mirrored by hand in
// KamposBackend's schemas/profile.ts (avitagSchema) since that's a separate
// repo — keep both in sync if either list changes. Hyphenated routes
// (forgot-password, verify-otp, etc.) aren't included: the charset check
// above already rejects hyphens, so they can never collide anyway.
const RESERVED_AVITAGS = new Set([
  "login",
  "signup",
  "feed",
  "settings",
  "gist",
  "api",
  "profile",
  "kampos",
  "kappy",
  "ceo",
  "admin",
  "test",
]);

/** Normalize an avitag the same way mobile does before validating/submitting. */
export function normalizeAvitag(raw: string): string {
  return raw.trim().toLowerCase().replace(ZERO_WIDTH_RE, "").normalize("NFC");
}

export function validateAvitag(raw: string): string | null {
  const avitag = normalizeAvitag(raw);
  if (!avitag) return "Avitag is required.";
  if (avitag.length < AVITAG_MIN || avitag.length > AVITAG_MAX)
    return `Avitag must be ${AVITAG_MIN}–${AVITAG_MAX} characters.`;
  if (!AVITAG_CHARSET_RE.test(avitag))
    return "Avitag can only contain letters, numbers, and underscores.";
  if (!HAS_LETTER_RE.test(avitag)) return "Avitag must contain at least one letter.";
  if (avitag.startsWith("_")) return "Avitag cannot start with an underscore.";
  if (avitag.endsWith("_")) return "Avitag cannot end with an underscore.";
  if (avitag.includes("__")) return "Avitag cannot contain two underscores in a row.";
  if (RESERVED_AVITAGS.has(avitag)) return "That avitag isn't available, abeg pick another.";
  return null;
}
