"use client";

/**
 * A two-wheel (Month | Day) scroll picker for an optional, year-less
 * birthday field — matches the approved mockup exactly: native-feeling
 * scroll-snap wheels, a center highlight band, and a live preview line.
 *
 * No birth YEAR is ever asked for or stored here — this only ever hands
 * back { month, day }. Deliberately: nothing on this page needs an age,
 * and a full DOB invites sensitive-data/legal overhead (age verification,
 * stricter data-protection handling) for zero benefit to "wish someone a
 * happy birthday."
 *
 * Controlled from the outside (month/day/onChange), same convention every
 * other field in ProfileSettingsForm already follows — this component owns
 * none of the "is this saved yet" question, only "what's currently picked."
 */

import { useEffect, useRef, useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// No birth year is ever collected, so there's no real leap year to check
// against — Feb unconditionally gets 29 days (not 28), the same call most
// year-less birthday pickers make, so nobody born on Feb 29 is quietly
// locked out of picking their real day.
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const ROW_H = 44; // px — must match the wheel-item/wheel-pad heights below

/** How many days from today until the next occurrence of this month/day —
 * this year's if it hasn't passed yet, next year's otherwise. `day` is
 * 0-indexed (0 = the 1st), same convention as everything else here.
 *
 * Feb 29 in a non-leap target year: `new Date` quietly rolls that over to
 * March 1 rather than throwing — the same graceful fallback other apps
 * without a stored birth year use, rather than a special case here. */
export function daysUntilBirthday(month: number, day: number): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let target = new Date(today.getFullYear(), month, day + 1);
  if (target < today) target = new Date(today.getFullYear() + 1, month, day + 1);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Mirrors the backend's own lock/cap decision exactly (see
 * student.controller.ts's updateBirthday) — up to 3 edits before the
 * first-ever celebration, then locked until the day BEFORE the next
 * anniversary of that celebration (not on it — the daily celebration job
 * also fires on that exact date, so unlocking a day early avoids racing
 * it and gives someone who doesn't want that date a real window to
 * change it first), auto-unlocking (with a fresh 3) at that point. Pure
 * read-only math for the UI to show the right state; the backend is
 * still the one that actually enforces this on save. */
export function computeBirthdayAccess(
  editCount: number,
  lastCelebratedAt: string | null,
): { editsRemaining: number; lockedUntil: Date | null } {
  if (lastCelebratedAt) {
    const unlocksAt = new Date(lastCelebratedAt);
    unlocksAt.setFullYear(unlocksAt.getFullYear() + 1);
    unlocksAt.setDate(unlocksAt.getDate() - 1);
    if (new Date() < unlocksAt) return { editsRemaining: 0, lockedUntil: unlocksAt };
    return { editsRemaining: 3, lockedUntil: null };
  }
  return { editsRemaining: Math.max(0, 3 - editCount), lockedUntil: null };
}

function Wheel({
  items,
  selectedIndex,
  onSettle,
  ariaLabel,
}: {
  items: string[];
  selectedIndex: number | null;
  onSettle: (index: number) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [liveIndex, setLiveIndex] = useState<number | null>(selectedIndex);

  // External changes (e.g. switching month reclamps the day) scroll this
  // wheel to match without re-triggering onSettle — only a genuine user
  // scroll should call back out.
  useEffect(() => {
    const el = ref.current;
    if (!el || selectedIndex === null) return;
    el.scrollTop = selectedIndex * ROW_H;
    setLiveIndex(selectedIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ROW_H)));
    setLiveIndex(idx);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      el.scrollTo({ top: idx * ROW_H, behavior: "smooth" });
      onSettle(idx);
    }, 120);
  };

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={handleScroll}
      className="relative h-[220px] flex-1 overflow-y-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{
        scrollSnapType: "y mandatory",
        maskImage: "linear-gradient(to bottom, transparent 0, black 70px, black 150px, transparent 220px)",
      }}
    >
      <div className="h-[88px]" />
      {items.map((label, i) => {
        const isSelected = liveIndex === i;
        const isNear = liveIndex !== null && Math.abs(liveIndex - i) === 1;
        return (
          <div
            key={label}
            style={{ scrollSnapAlign: "center", height: ROW_H }}
            className={`flex items-center justify-center font-nunito tabular-nums transition-[color,font-size,font-weight] duration-150 ${
              isSelected
                ? "text-[17px] font-extrabold text-brand"
                : isNear
                  ? "text-[15px] font-semibold text-muted"
                  : "text-[15px] font-semibold text-faint"
            }`}
            onClick={() => ref.current?.scrollTo({ top: i * ROW_H, behavior: "smooth" })}
          >
            {label}
          </div>
        );
      })}
      <div className="h-[88px]" />
    </div>
  );
}

export function BirthdayPicker({
  month,
  day,
  onMonthChange,
  onDayChange,
}: {
  /** 0-indexed (0 = January), null when nothing picked yet. */
  month: number | null;
  /** 0-indexed (0 = the 1st), null when nothing picked yet. */
  day: number | null;
  /** Fires on its own axis only — deliberately NOT a combined
   * onChange(month, day). Each wheel settles on its own independent
   * 120ms timer (see Wheel's handleScroll), so a quick month-then-day
   * swipe can have both timers resolve moments apart; a combined callback
   * that reads the OTHER axis's prop at settle time can read a stale
   * value from before the first settle's update even landed, and the
   * later settle then silently overwrites it back. Keeping each callback
   * to exactly the axis it just measured, with the caller doing any
   * cross-axis clamping via a functional setState update (always reads
   * the true-latest value, not a snapshot), removes the race entirely. */
  onMonthChange: (month: number) => void;
  onDayChange: (day: number) => void;
}) {
  const dayCount = DAYS_IN_MONTH[month ?? 0];
  const dayLabels = Array.from({ length: dayCount }, (_, i) => String(i + 1));

  return (
    <div className="relative flex h-[220px] gap-0.5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[88px] z-0 h-11 rounded-2xl border-[1.5px] border-brand/35 bg-brand-tint"
      />
      <div className="relative z-10 flex-1">
        <Wheel items={MONTHS} selectedIndex={month} onSettle={onMonthChange} ariaLabel="Birth month" />
      </div>
      <div className="relative z-10 flex-1">
        <Wheel items={dayLabels} selectedIndex={day} onSettle={onDayChange} ariaLabel="Birth day" />
      </div>
    </div>
  );
}

export { MONTHS as BIRTHDAY_MONTHS, DAYS_IN_MONTH as BIRTHDAY_DAYS_IN_MONTH };
