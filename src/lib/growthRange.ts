/** Shared date-range math for every /villagepeople/growth/* page's controls
 * bar — mirrors the inclusive 'YYYY-MM-DD' convention the backend's own
 * stats.repo.ts `DateRange` uses, so a range built here can be passed
 * straight through as `?from=&to=`. */

export type RangeKey = "today" | "7d" | "30d" | "month" | "custom" | "all";

export interface DateRange {
  from: string;
  to: string;
}

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  "7d": "7d",
  "30d": "30d",
  month: "This month",
  custom: "Custom",
  all: "All time",
};

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "All time" has no real backend-side meaning (activity_events has no
 * documented epoch) — approximated with a fixed early anchor date rather
 * than an unbounded query, same idea as picking a safe default window. */
const ALL_TIME_FROM = "2024-01-01";

export function computeRange(key: RangeKey, custom?: { from?: string; to?: string }): DateRange {
  const today = new Date();
  const to = iso(today);
  switch (key) {
    case "today":
      return { from: to, to };
    case "7d": {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: iso(from), to };
    }
    case "30d": {
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { from: iso(from), to };
    }
    case "month": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: iso(from), to };
    }
    case "all":
      return { from: ALL_TIME_FROM, to };
    case "custom":
      return { from: custom?.from && custom.from <= to ? custom.from : to, to: custom?.to ?? to };
  }
}
