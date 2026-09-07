"use client";

export interface BreakdownSegment {
  key: string;
  label: string;
  value: number;
  /** A CSS color value — either a literal hex or a `var(--…)` reference
   * resolved by the caller's own theme-scoped <style> block (see
   * HqDashboard.tsx's `.hq-viz` block) — so light/dark swap for free
   * without this component needing to know which mode is active. */
  color: string;
}

/**
 * A compact horizontal stacked bar + legend for a part-to-whole breakdown
 * (accounts by status, profiles by type) — the dataviz skill's documented
 * default form for this job, chosen over a donut specifically because a
 * donut asks the reader to compare arc angles (a skill people are bad at)
 * where a bar asks them to compare lengths along one axis. Segments keep a
 * FIXED order (the order `segments` is passed in, never re-sorted by
 * value) so a color always means the same category — the same "color
 * follows the entity, never its rank" rule the audit log's own action
 * colors already follow.
 *
 * The legend lists every segment, including zero-value ones, so nothing is
 * silently hidden — only the bar itself skips zero-width segments (they'd
 * render nothing anyway). Values live in the legend text (never gated
 * behind a hover-only tooltip), and text stays in ink/faint — the swatch
 * dot is the only thing that carries the actual data color, per "text
 * never wears the data color."
 */
export function BreakdownBar({ segments }: { segments: BreakdownSegment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const nonZero = segments.filter((s) => s.value > 0);

  return (
    <div className="flex flex-col gap-2.5">
      {total > 0 && (
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-line/40">
          {nonZero.map((s, i) => (
            <div
              key={s.key}
              style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
              className={i < nonZero.length - 1 ? "border-r-2 border-surface" : ""}
              title={`${s.label}: ${s.value.toLocaleString()}`}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="font-nunito text-[11px] text-faint">
              {s.label} <span className="font-bold text-ink">{s.value.toLocaleString()}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
