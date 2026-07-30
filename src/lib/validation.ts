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

export function validatePassword(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 8) errors.push("Password must be at least 8 characters long.");
  if (/\s/.test(password)) errors.push("Password cannot contain spaces.");
  if (!/[a-z]/.test(password)) errors.push("Include at least one lowercase letter.");
  if (!/[A-Z]/.test(password)) errors.push("Include at least one uppercase letter.");
  if (!/[0-9]/.test(password)) errors.push("Include at least one number.");
  if (!/[@$!%*?#&]/.test(password))
    errors.push("Include at least one special character (e.g. @, $, #, !).");
  return errors;
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
  return null;
}
