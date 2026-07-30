// Zero-width/bidi-format chars (used to hide text, dodge word filters, or
// spoof display order — e.g. U+202E right-to-left override) plus raw
// control chars, minus the ones we actually want to keep (\n, \t). Written
// as explicit \u escapes rather than pasting the literal invisible
// characters into source, which would be unreadable and impossible to diff.
const INVISIBLE_AND_CONTROL_CHARS = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F" + // C0 controls (keep \t \n)
    "\\u0080-\\u009F" + // C1 controls
    "\\u200B-\\u200F" + // zero-width space/joiners, LRM/RLM
    "\\u202A-\\u202E" + // bidi embedding/override
    "\\u2060-\\u2064" + // word joiner & invisible math operators
    "\\u2066-\\u2069" + // bidi isolates
    "\\uFEFF]", // BOM / zero-width no-break space
  "g",
);

/** Safe to run on every keystroke — strips hidden/spoofing characters
 * without touching visible text, so it never fights what someone's typing
 * (no live-trimming, which would eat trailing spaces mid-word). */
export function stripInvisibleChars(input: string): string {
  return input.replace(INVISIBLE_AND_CONTROL_CHARS, "");
}

/** Final pass before a gist/comment actually gets sent: invisible-char
 * strip, trim, and cap runs of blank lines (so someone can't pad a post
 * into a wall of empty space to break feed layout/scroll). React already
 * escapes everything it renders as text, so this isn't about HTML/script
 * injection — it's about content hygiene the renderer can't fix for you. */
export function sanitizeForSubmit(input: string): string {
  return stripInvisibleChars(input)
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/** Keeps only characters safe in a filename across every OS/filesystem the
 * upload might ever touch (no path separators, no null bytes, no unicode
 * spoofing tricks), and caps the length. Extension is preserved separately
 * so sanitizing never corrupts it. */
export function sanitizeFileName(name: string): string {
  const stripped = stripInvisibleChars(name).trim();
  const lastDot = stripped.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < stripped.length - 1;
  const base = hasExt ? stripped.slice(0, lastDot) : stripped;
  const ext = hasExt ? stripped.slice(lastDot) : "";

  const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "").slice(0, 10);
  return `${safeBase}${safeExt}`;
}
