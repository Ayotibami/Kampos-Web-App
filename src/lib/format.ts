/** Format seconds as m:ss for countdowns (mobile otpFormatter equivalent). */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Compact relative time, e.g. "now", "5m", "3h", "2d", else a short date. */
export function timeAgo(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Friendly absolute date + time, e.g. "Jul 26 · 3:42 PM" — drops the year when
 * it's the current year, matches it in when it isn't. Complements timeAgo():
 * that one answers "how recent", this one answers "exactly when".
 */
export function friendlyDateTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

/**
 * Compact number, standard social-media style (Twitter/Instagram-like): a
 * decimal only shows while the whole part is a single digit — 1.2k, 9.8k —
 * and disappears once it hits double digits — 12k, 99k, 999k, 1.2m, 12m.
 * Keeps the output to a predictable max of ~4 characters for realistic counts.
 */
export function compactNumber(n?: number): string {
  if (!n || n < 1000) return String(n ?? 0);

  const format = (value: number, suffix: string): string => {
    if (value < 10) {
      const decimal = value.toFixed(1); // "1.0", "1.2", or a rounding edge like "10.0"
      return decimal.endsWith(".0") ? `${decimal.slice(0, -2)}${suffix}` : `${decimal}${suffix}`;
    }
    return `${Math.floor(value)}${suffix}`;
  };

  if (n < 1_000_000) return format(n / 1000, "k");
  return format(n / 1_000_000, "m");
}
