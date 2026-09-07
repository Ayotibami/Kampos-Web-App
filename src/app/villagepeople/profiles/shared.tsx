import type { AdminProfileStatus } from "@/lib/serverProfilesAdmin";

/**
 * Small pieces shared across the 5 per-type Profiles tabs
 * (StudentProfilesTab.tsx etc.) — filter option lists, a status color
 * helper, and a display-field builder mirroring profileDisplayFields.ts's
 * own "skip absent values, don't show a blank row" behavior but for a
 * search-result row rather than an account-detail row (a distinct shape per
 * this task's own guidance — these rows aren't AccountProfileRow).
 *
 * Kept as plain data/helpers, not a shared list/scroll hook — this section
 * mirrors this codebase's own established style for near-identical list
 * screens (AllGistsManager/UsersManager/the three moderation tabs all
 * implement their own local state/effects rather than share one generic
 * hook), so each tab stays a fully self-contained component per the task's
 * own "mirror PendingPostsTab/ReportsTab's existing split" instruction.
 */

export const PAGE_SIZE = 20;
export const SEARCH_DEBOUNCE_MS = 400;

export const STATUS_OPTIONS: { value: AdminProfileStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "DEACTIVATED", label: "Deactivated" },
  { value: "BANNED", label: "Banned" },
  { value: "DELETED", label: "Deleted" },
];

/** Read-only filtering only — per this task's explicit "no ban/deactivate
 * UI" exclusion, selecting BANNED/DEACTIVATED here only narrows the list to
 * profiles already in that state, it never writes it. */
export const VERIFIED_OPTIONS: { value: "" | "true" | "false"; label: string }[] = [
  { value: "", label: "All" },
  { value: "true", label: "Verified" },
  { value: "false", label: "Unverified" },
];

export const LEVEL_OPTIONS = ["", "100", "200", "300", "400", "500", "600"];

export function statusColor(status?: string): string {
  if (!status || status === "ACTIVE") return "text-success";
  if (status === "DEACTIVATED") return "text-warning";
  if (status === "BANNED" || status === "DELETED") return "text-danger";
  return "text-muted";
}

export interface DisplayField {
  label: string;
  value: string;
}

/** Same "skip null/undefined/empty rather than show a blank row" semantics
 * as profileDisplayFields.ts's own `present`/`add`, generalized to a plain
 * list of [label, value, formatter?] tuples so each tab can build its own
 * type-appropriate summary without re-deriving this filtering logic. */
export function buildFields(
  entries: Array<[string, unknown, ((v: unknown) => string)?]>,
): DisplayField[] {
  const fields: DisplayField[] = [];
  for (const [label, value, format] of entries) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    fields.push({ label, value: format ? format(value) : String(value) });
  }
  return fields;
}

// `w-full min-w-0 sm:w-auto` — a native <select> sizes itself to its
// longest <option> by default (no CSS involved), which is fine on desktop
// but genuinely overflows a phone screen once a real campus/major name is
// selected (confirmed live: 407px wide against a 375px viewport). Full
// width below `sm` lets each filter stack on its own line instead;
// `min-w-0` is required for a flex child to actually shrink to that width
// rather than keeping its intrinsic content size regardless of the class.
export const selectClass =
  "w-full min-w-0 rounded-2xl border border-line bg-surface-2 px-4 py-2.5 font-nunito text-sm text-ink outline-none focus:border-brand sm:w-auto";
