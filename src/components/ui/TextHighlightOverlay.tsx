import { linkifyAsHighlightSpans } from "./Linkify";

/**
 * The "make a link look like a link while you're still typing it" trick —
 * a plain `<textarea>` can't style part of its own value (no partial color,
 * no partial underline), so this sits as an absolutely-positioned sibling
 * on top of the real textarea, rendering the exact same text with any URL
 * substring highlighted via linkifyAsHighlightSpans. The textarea itself
 * stays completely real and untouched — same paste/undo/character-limit/
 * mobile-keyboard behavior as before — except its own text becomes
 * `text-transparent` (with `caret-color` set explicitly so the blinking
 * cursor still shows) so what's actually SEEN is this overlay's styled
 * copy showing through, not the invisible real one underneath.
 *
 * ONLY safe to show while the draft still fits on one line — confirmed,
 * exhaustively, that a native `<textarea>` and a plain `<div>` disagree on
 * exactly where text wraps once it spans multiple lines, EVEN with every
 * relevant CSS property (font, padding, line-height, word-break,
 * overflow-wrap, box-sizing, border, width, letter-spacing) provably
 * identical between them — a genuine browser-level quirk, reproducible
 * even with plain text and no highlighting involved at all, not something
 * fixable by matching more CSS. So `active` MUST be driven by
 * measuresAsSingleLine (below), read from the REAL textarea's own
 * scrollHeight — the one measurement that's actually authoritative, since
 * it comes from the textarea's own layout, not a guess made by this
 * separate element. The instant a draft wraps to a second line, the
 * caller stops rendering this (passes active={false}) and lets the real
 * textarea show its own plain-colored text again — no attempt to keep
 * multi-line drafts highlighted, because that's exactly the case that
 * can't be made to agree pixel-for-pixel.
 *
 * For the single-line case this covers, the caller's `className` must
 * still be byte-for-byte the same font/size/weight/leading/padding/
 * text-align classes the real textarea uses (color/background classes
 * aside) — any mismatch there shows up as misaligned characters.
 */
export function TextHighlightOverlay({
  text,
  className,
  overlayRef,
  active,
}: {
  text: string;
  className: string;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  active: boolean;
}) {
  if (!active) return null;
  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words ${className}`}
    >
      {linkifyAsHighlightSpans(text)}
    </div>
  );
}

/** Whether `el`'s current content still fits on a single visual line —
 * the one authoritative check TextHighlightOverlay's `active` prop must be
 * driven by (see its own doc for why). Compares the textarea's OWN
 * scrollHeight (the browser's real layout of the real text — not this
 * overlay's independent, sometimes-disagreeing guess) against what a
 * single line's height should be for its current font-size/line-height/
 * padding, read live via getComputedStyle so this keeps working correctly
 * even under a caller like CreateGistSheet's hero-preview mode, where the
 * font-size itself changes dynamically as you type. A small epsilon (1px)
 * absorbs sub-pixel rounding, nothing more.
 *
 * A textarea with a tall `min-height` (CreateGistSheet's plain mode sets
 * min-h-36, 144px, to leave room for typing a longer gist) would otherwise
 * always fail this check — scrollHeight floors at min-height regardless of
 * how little text is actually in there, so one short single-line draft
 * would incorrectly measure as "144px tall" and never light up at all.
 * Neutralizing min-height for the instant of measurement (synchronously,
 * inside the same layout-effect tick the caller already runs this from —
 * restored before anything paints, so there's nothing to visibly flicker)
 * gets the real, unconstrained content height instead. */
export function measuresAsSingleLine(el: HTMLTextAreaElement): boolean {
  const style = getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight);
  const paddingTop = parseFloat(style.paddingTop);
  const paddingBottom = parseFloat(style.paddingBottom);
  const singleLineHeight = lineHeight + paddingTop + paddingBottom;

  const priorMinHeight = el.style.minHeight;
  el.style.minHeight = "0px";
  const contentHeight = el.scrollHeight;
  el.style.minHeight = priorMinHeight;

  return contentHeight <= singleLineHeight + 1;
}
