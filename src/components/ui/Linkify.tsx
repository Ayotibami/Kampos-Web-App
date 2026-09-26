import type { ReactNode } from "react";

// Requires an explicit "http(s)://" or "www." — deliberately NOT matching a
// bare "example.com". Without that guard, ordinary prose ("e.g. bring your
// own laptop", "3.5 GPA", "U.S. history") would start lighting up as fake
// links constantly. Every major app that autolinks plain text (Twitter,
// Instagram) makes the same trade-off. \S+ (not whitespace) as the body is
// intentionally greedy — trailing punctuation the regex swept up along the
// way gets peeled back off in trimTrailingPunctuation below, rather than
// trying to get the character class exactly right up front.
const URL_PATTERN = /(https?:\/\/\S+|www\.\S+)/gi;

const TRAILING_PUNCTUATION = new Set([".", ",", "!", "?", ";", ":", "'", '"', ")", "]", "}"]);

/** Strips sentence punctuation a greedy URL match swept up ("check this
 * out: https://example.com." shouldn't link the trailing "."), while
 * leaving a genuinely-part-of-the-URL closing paren alone (a Wikipedia-style
 * link like ".../wiki/Rick_(actor)" keeps its ")" since an earlier "("
 * balances it — only an UNBALANCED trailing ")" reads as outer sentence
 * punctuation and gets stripped). */
function trimTrailingPunctuation(url: string): string {
  let end = url.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(url[end - 1])) {
    if (url[end - 1] === ")") {
      const upTo = url.slice(0, end);
      const opens = (upTo.match(/\(/g) ?? []).length;
      const closes = (upTo.match(/\)/g) ?? []).length;
      if (closes <= opens) break; // balanced — this ")" is part of the URL, keep it
    }
    end--;
  }
  return url.slice(0, end);
}

let linkKeySeq = 0;

/** Splits `text` into a mix of plain strings and real, tappable `<a>`
 * elements wherever a URL appears — the shared engine behind <Linkify>.
 * Exported separately (not just the component) so a caller that needs to
 * pre-truncate text (CommentBody, the Spot caption) can slice the raw
 * string FIRST and only run this over the already-shortened result — same
 * order those call sites already truncate in today, just with this
 * inserted as the last step instead of handing the substring straight to
 * React as a bare string. */
export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    const raw = match[0];
    const trimmed = trimTrailingPunctuation(raw);
    if (!trimmed) continue;
    const end = start + trimmed.length;

    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));

    // A bare "www.example.com" has no scheme — the href needs one or the
    // browser resolves it as a path relative to the current page (e.g.
    // "/www.example.com") instead of actually leaving the app.
    const href = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;

    nodes.push(
      <a
        key={`linkify-${linkKeySeq++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        // This text sits inside cards/bubbles that are themselves tappable
        // (double-tap-to-react, tap-to-expand) — without this, tapping a
        // link would also trigger whatever the surrounding card does on
        // tap. Only stops propagation, never preventDefault: the actual
        // navigation must still go through untouched.
        onClick={(e) => e.stopPropagation()}
        className="break-all text-blue-600 underline underline-offset-2 dark:text-blue-400"
      >
        {trimmed}
      </a>,
    );

    lastIndex = end;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  // No links found — return the original string as a single-item array
  // rather than forcing every caller to special-case an empty match.
  return nodes.length > 0 ? nodes : [text];
}

/** Drop-in replacement for rendering a raw `{text}` string — wraps any URL
 * inside it in a real, styled, tappable link. See linkifyText for the
 * detection/trimming rules this renders. */
export function Linkify({ text }: { text: string }) {
  return <>{linkifyText(text)}</>;
}
