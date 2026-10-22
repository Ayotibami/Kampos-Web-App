/**
 * Shared helpers for every recharts-based chart under /villagepeople/growth
 * (and TrendChart, which these were originally lifted out of) — kept in one
 * place so every chart's axis ticks/date labels behave identically instead
 * of each component reinventing its own rounding.
 */

/** "YYYY-MM-DD" -> "Oct 20" (locale month/day), used on X axes and tooltips. */
export function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Clean, evenly-spaced integer ticks for a Y-axis (0, then round steps up to
 * the data max) — see TrendChart.tsx's own doc comment for why this exists
 * instead of recharts' built-in "nice tick" generator.
 */
export function niceTicks(max: number, targetCount = 4): number[] {
  if (max <= 0) return [0, 1];
  const rawStep = max / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  const step = Math.max(1, Math.round((residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude));
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}
