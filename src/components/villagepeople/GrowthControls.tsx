"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { friendlyDateTime } from "@/lib/format";
import { RANGE_LABELS, type RangeKey } from "@/lib/growthRange";
import { CalendarIconFill, CompareIconFill, FilterIconFill, CaretDownIconFill } from "@/components/ui/icons";

const RANGE_KEYS: RangeKey[] = ["today", "7d", "30d", "month", "custom", "all"];

export interface GrowthControlsValue {
  rangeKey: RangeKey;
  customFrom: string;
  customTo: string;
  compare: boolean;
  campusTags: string[];
}

/**
 * The one global controls bar for every /villagepeople/growth/* page — date
 * range, compare-vs-previous toggle, campus filter, last-updated timestamp.
 * Built as a single reusable component per the spec, since every growth
 * page needs the same bar rather than reinventing it.
 *
 * `showCompare`/`showCampusFilter` let a page hide a control its own
 * endpoint genuinely doesn't support (top-posts/top-users take no
 * `compare`; most series endpoints have no server-side campus filter at
 * all — see this component's own module doc below) rather than showing a
 * toggle that silently does nothing.
 */
export function GrowthControls({
  value,
  onChange,
  lastUpdated,
  onRefresh,
  showCompare = true,
  showCampusFilter = true,
  campusFilterHint,
}: {
  value: GrowthControlsValue;
  onChange: (next: GrowthControlsValue) => void;
  lastUpdated: string | null;
  onRefresh?: () => void;
  showCompare?: boolean;
  showCampusFilter?: boolean;
  /** Shown under the campus dropdown when the filter only applies to part
   * of the page (e.g. "Filters this page's table, not the charts above" —
   * see GrowthDashboard's own note: the DAU/WAU/MAU/signups/posts
   * endpoints have no server-side per-campus breakdown at all). */
  campusFilterHint?: string;
}) {
  const [campuses, setCampuses] = useState<{ campus_tag: string; campus_name: string }[]>([]);
  const [campusOpen, setCampusOpen] = useState(false);
  const campusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showCampusFilter) return;
    api
      .get("/misc/campuses")
      .then((res) => setCampuses(res.data?.data ?? []))
      .catch(() => setCampuses([]));
  }, [showCampusFilter]);

  useEffect(() => {
    if (!campusOpen) return;
    const onClick = (e: MouseEvent) => {
      if (campusRef.current && !campusRef.current.contains(e.target as Node)) setCampusOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [campusOpen]);

  const toggleCampus = (tag: string) => {
    const next = value.campusTags.includes(tag)
      ? value.campusTags.filter((t) => t !== tag)
      : [...value.campusTags, tag];
    onChange({ ...value, campusTags: next });
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line/70 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {RANGE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ ...value, rangeKey: key })}
              className={`rounded-full px-3 py-1.5 font-nunito text-xs font-bold transition ${
                value.rangeKey === key ? "bg-brand text-white" : "bg-line/20 text-muted hover:bg-line/40"
              }`}
            >
              {RANGE_LABELS[key]}
            </button>
          ))}
        </div>

        {showCompare && (
          <button
            type="button"
            onClick={() => onChange({ ...value, compare: !value.compare })}
            className={`ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 font-nunito text-xs font-bold transition ${
              value.compare ? "bg-brand/15 text-brand" : "bg-line/20 text-muted hover:bg-line/40"
            }`}
          >
            <CompareIconFill className="h-3.5 w-3.5" weight="fill" />
            Compare vs previous
          </button>
        )}

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className={`rounded-full px-3 py-1.5 font-nunito text-xs font-bold text-muted transition hover:bg-line/40 ${showCompare ? "" : "ml-auto"}`}
          >
            Refresh
          </button>
        )}
      </div>

      {value.rangeKey === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <CalendarIconFill className="h-3.5 w-3.5 text-faint" weight="fill" />
          <input
            type="date"
            value={value.customFrom}
            onChange={(e) => onChange({ ...value, customFrom: e.target.value })}
            className="rounded-xl border border-line bg-surface-2 px-2.5 py-1.5 font-nunito text-xs text-ink outline-none focus:border-brand"
          />
          <span className="font-nunito text-xs text-faint">to</span>
          <input
            type="date"
            value={value.customTo}
            onChange={(e) => onChange({ ...value, customTo: e.target.value })}
            className="rounded-xl border border-line bg-surface-2 px-2.5 py-1.5 font-nunito text-xs text-ink outline-none focus:border-brand"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/50 pt-2.5">
        {showCampusFilter ? (
          <div className="relative" ref={campusRef}>
            <button
              type="button"
              onClick={() => setCampusOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-full border border-line/70 px-3 py-1.5 font-nunito text-xs font-semibold text-ink transition hover:border-brand/40"
            >
              <FilterIconFill className="h-3.5 w-3.5 text-faint" weight="fill" />
              {value.campusTags.length > 0 ? `${value.campusTags.length} campus${value.campusTags.length > 1 ? "es" : ""}` : "All campuses"}
              <CaretDownIconFill className="h-3 w-3 text-faint" weight="fill" />
            </button>
            {campusOpen && (
              <div className="absolute left-0 top-full z-20 mt-1.5 max-h-64 w-56 overflow-y-auto rounded-2xl border border-line/70 bg-surface-2 p-2 shadow-xl">
                {value.campusTags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, campusTags: [] })}
                    className="mb-1 w-full rounded-lg px-2 py-1 text-left font-nunito text-xs font-semibold text-brand hover:bg-brand/10"
                  >
                    Clear all
                  </button>
                )}
                {campuses.length === 0 ? (
                  <p className="px-2 py-1.5 font-nunito text-xs text-faint">No campuses yet.</p>
                ) : (
                  campuses.map((c) => (
                    <label
                      key={c.campus_tag}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 font-nunito text-xs text-ink hover:bg-line/20"
                    >
                      <input
                        type="checkbox"
                        checked={value.campusTags.includes(c.campus_tag)}
                        onChange={() => toggleCampus(c.campus_tag)}
                        className="accent-brand"
                      />
                      {c.campus_name}
                    </label>
                  ))
                )}
              </div>
            )}
            {campusFilterHint && <p className="mt-1 font-nunito text-[10px] text-faint">{campusFilterHint}</p>}
          </div>
        ) : (
          <span />
        )}
        <span className="font-nunito text-[11px] text-faint">
          {lastUpdated ? `Updated ${friendlyDateTime(lastUpdated)}` : "Loading…"}
        </span>
      </div>
    </div>
  );
}
