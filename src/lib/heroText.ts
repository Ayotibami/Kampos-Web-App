/**
 * Shared sizing for the "hero statement" treatment (a gist's colored,
 * text-only card) — used by both the posted card (GistCard's ShortGist) and
 * the compose sheet's live preview, so composing genuinely previews what
 * posting will look like instead of two independently-tuned approximations.
 *
 * One fixed size (HERO_TEXT_NOMINAL_REM), not a length-driven curve — a
 * per-length curve was tried first and made the treatment worse for exactly
 * the gists it was meant to flatter: a short-but-not-tiny gist (several
 * words, not one) got handed a large nominal size, and even when that size
 * technically fit inside the box without clipping, a handful of words at
 * that size wraps into awkward, unevenly-shaped lines — the box wasn't
 * overflowing, it just read badly. One consistent size means every short
 * gist gets the same deliberate, bold-but-readable treatment regardless of
 * length. fitHeroBlock/fitHeroTextarea still measure the real rendered box
 * and shrink further ONLY if it's genuinely overflowing (a run of unusually
 * long words, a narrow viewport, a gist near the length cutoff) — a safety
 * net against clipping, not a sizing strategy of its own.
 */
export const HERO_TEXT_MIN_REM = 1; // ~16px — smallest a hero statement should ever render, any device
export const HERO_TEXT_NOMINAL_REM = 1.75; // ~28px — bold enough to read as a deliberate statement, restrained enough that a handful of words still wraps cleanly
export const HERO_TEXT_STEP_REM = 0.0625; // 1px steps at the default root size — fine enough not to visibly jump

/** For a block element whose own height already tracks its content (e.g. a
 * `<p>`) — starts at `startRem` and shrinks `el`'s font-size only if it's
 * actually overflowing `container` in either dimension, down to the floor.
 * Returns the settled size in rem. */
export function fitHeroBlock(el: HTMLElement, container: HTMLElement, startRem: number = HERO_TEXT_NOMINAL_REM): number {
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
  startRem: number = HERO_TEXT_NOMINAL_REM,
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
