/**
 * Shared sizing for the "hero statement" treatment (a gist's colored,
 * text-only card) — used by both the posted card (GistCard's ShortGist) and
 * the compose sheet's live preview, so composing genuinely previews what
 * posting will look like instead of two independently-tuned approximations.
 *
 * Two parts, not one:
 *  1. nominalHeroTextRem — a standard, length-driven STARTING size. This is
 *     the actual visual signal: shorter text reliably reads bigger than
 *     longer text, predictably, every time.
 *  2. fitHeroBlock/fitHeroTextarea — measure the real rendered box from
 *     that starting point and shrink further ONLY if it's actually
 *     overflowing. A pure measure-and-shrink-if-needed approach (no nominal
 *     size) was tried first and got this backwards: two different-length
 *     texts that both already fit at the max size rendered identically
 *     ("hey" looked the same as a 15-char gist) because neither needed to
 *     shrink. The nominal size fixes that; the measurement pass is only a
 *     safety net for cases the formula didn't predict (a run of unusually
 *     long words, a narrow viewport), guaranteeing no overflow either way.
 */
export const HERO_TEXT_MIN_REM = 1; // ~16px — smallest a hero statement should ever render, any device
export const HERO_TEXT_MAX_REM = 3; // one-word gist ceiling
export const HERO_TEXT_STEP_REM = 0.0625; // 1px steps at the default root size — fine enough not to visibly jump

/**
 * Sqrt curve, not linear: drops faster per character early on (so "hey" and
 * a 15-char gist actually look different from each other) and flattens out
 * for the long tail, instead of a flat slope where anything under ~20
 * characters was nearly indistinguishable. Tuned to reach the floor right
 * around SHORT_TEXT (200 — GistCard's own cutoff for even showing this
 * treatment at all), so the whole eligible range actually uses the scale.
 */
export function nominalHeroTextRem(length: number): number {
  const size = HERO_TEXT_MAX_REM - 0.1414 * Math.sqrt(length);
  return Math.min(HERO_TEXT_MAX_REM, Math.max(HERO_TEXT_MIN_REM, size));
}

/** For a block element whose own height already tracks its content (e.g. a
 * `<p>`) — starts at `startRem` and shrinks `el`'s font-size only if it's
 * actually overflowing `container` in either dimension, down to the floor.
 * Returns the settled size in rem. */
export function fitHeroBlock(el: HTMLElement, container: HTMLElement, startRem: number = HERO_TEXT_MAX_REM): number {
  let size = startRem;
  el.style.fontSize = `${size}rem`;
  let guard = 0;
  while (
    (el.scrollHeight > container.clientHeight || el.scrollWidth > container.clientWidth) &&
    size > HERO_TEXT_MIN_REM &&
    guard < 80
  ) {
    size = Math.max(HERO_TEXT_MIN_REM, size - HERO_TEXT_STEP_REM);
    el.style.fontSize = `${size}rem`;
    guard += 1;
  }
  return size;
}

/** For a `<textarea>` — unlike a `<p>`, a textarea needs its own height
 * explicitly recalculated (the standard autosize-textarea technique:
 * collapse to `auto`, then read `scrollHeight`) at every font-size step,
 * since its native box doesn't otherwise track content height at all.
 * Leaves the element's height set to its final content height so the
 * caller's flex container can center it, matching ShortGist's centered
 * `<p>`. Returns the settled size in rem. */
export function fitHeroTextarea(
  el: HTMLTextAreaElement,
  container: HTMLElement,
  startRem: number = HERO_TEXT_MAX_REM,
): number {
  let size = startRem;
  let guard = 0;
  el.style.fontSize = `${size}rem`;
  el.style.height = "auto";
  while (el.scrollHeight > container.clientHeight && size > HERO_TEXT_MIN_REM && guard < 80) {
    size = Math.max(HERO_TEXT_MIN_REM, size - HERO_TEXT_STEP_REM);
    el.style.fontSize = `${size}rem`;
    el.style.height = "auto";
    guard += 1;
  }
  el.style.height = `${el.scrollHeight}px`;
  return size;
}
