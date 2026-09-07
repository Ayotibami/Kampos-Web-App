"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
  UsersIconFill,
  ProfilesIconFill,
  SignupIconFill,
  LoginIconFill,
  EngagementIconFill,
  PendingIconFill,
  AdminsIconFill,
  AuditIconFill,
  ExternalLinkIconFill,
} from "@/components/ui/icons";
import { compactNumber } from "@/lib/format";
import { friendlyDateTime } from "@/lib/format";
import type { HqStats } from "@/lib/serverStats";
import type { AuditLogRow } from "@/lib/auditActions";
import { ACTION_LABEL, ACTION_COLOR, TargetCell } from "./audit/AuditLogManager";
import { BreakdownBar } from "@/components/villagepeople/BreakdownBar";
import { TrendChart } from "@/components/villagepeople/TrendChart";

/**
 * Chart-only color slots, scoped to this page via the `.hq-viz` class (not
 * global tokens) — following the dataviz skill's own recommended pattern
 * (palette.md: "define the slots you use as CSS custom properties in a
 * local <style> block"). Dark values are re-declared under `.dark .hq-viz`
 * specifically — NOT the skill's own generic `data-theme`/`prefers-color-
 * scheme` pattern, which doesn't apply here: this app's dark mode is a
 * plain `.dark` class toggled on `<html>` by ThemeRouteSync, driven purely
 * by a stored user preference (it deliberately ignores OS preference by
 * default — see themeStore.ts) — confirmed against globals.css's own
 * `:root` / `.dark` blocks before writing this, rather than assumed.
 *
 * `--cat-*` is the profiles-by-type categorical order (Student/Kreator/
 * Kompany/School/Admin) — validated with the skill's own
 * scripts/validate_palette.js against Kampos's real surfaces (#fcfcff
 * light, #0a0e17 dark): all hard gates pass in both modes (light carries a
 * sub-3:1 contrast WARN on 3 of the 5 slots, mitigated by BreakdownBar's
 * always-visible legend + value labels, per the skill's relief rule).
 * Status colors (accounts-by-status) reuse Kampos's OWN existing success/
 * warning/danger tokens directly — that's state data, not series identity,
 * so it gets status colors, not a generated categorical hue; brand/brand-
 * accent (the two trend lines) are Kampos's real brand colors, which are
 * already theme-constant (see globals.css), so neither needs a dark
 * override here.
 */
const HQ_VIZ_STYLE = `
.hq-viz {
  --series-signups: #165abf;
  --series-gists: #0bb0ff;
  --cat-student: #2a78d6;
  --cat-kreator: #eb6834;
  --cat-kompany: #1baf7a;
  --cat-school: #eda100;
  --cat-admin: #e87ba4;
}
.dark .hq-viz {
  --cat-student: #3987e5;
  --cat-kreator: #d95926;
  --cat-kompany: #199e70;
  --cat-school: #c98500;
  --cat-admin: #d55181;
}
`;

/** Fixed order + color for the accounts-by-status bar — state data, so it
 * wears status colors (Kampos's own success/warning/danger), not generated
 * categorical hues. "Deactivated" is neither good nor bad (self-paused),
 * so it gets a neutral gray rather than being forced into the 3-color
 * good/warning/critical scale. */
const ACCOUNT_STATUS_CONFIG: { key: string; label: string; color: string }[] = [
  { key: "ACTIVE", label: "Active", color: "var(--color-success)" },
  { key: "DEACTIVATED", label: "Deactivated", color: "var(--color-faint)" },
  { key: "SUSPENDED", label: "Suspended", color: "var(--color-warning)" },
  { key: "DELETED", label: "Deleted", color: "var(--color-danger)" },
];

/** Fixed order + color for the profiles-by-type bar — genuine nominal
 * categorical identity (no type is "more" than another), so it draws from
 * the validated categorical slots in HQ_VIZ_STYLE, always in this same
 * order regardless of which counts are zero. */
const PROFILE_TYPE_CONFIG: { key: string; label: string; color: string }[] = [
  { key: "STUDENT", label: "Students", color: "var(--cat-student)" },
  { key: "KREATOR", label: "Kreators", color: "var(--cat-kreator)" },
  { key: "KOMPANY", label: "Kompanies", color: "var(--cat-kompany)" },
  { key: "SCHOOL", label: "Schools", color: "var(--cat-school)" },
  { key: "IDIOT", label: "Admins", color: "var(--cat-admin)" },
];

/** One KPI card: a headline number, an icon, a label, and optional
 * secondary "today / 7d / 30d"-style breakdown underneath. */
function StatCard({
  icon: Icon,
  label,
  value,
  breakdown,
  footer,
  href,
  tone = "default",
}: {
  icon: PhosphorIcon;
  label: string;
  value: number;
  breakdown?: { label: string; value: number }[];
  /** Richer footer content (e.g. a BreakdownBar) — takes the same slot as
   * `breakdown`'s text pills, mutually exclusive with it. */
  footer?: ReactNode;
  href?: string;
  tone?: "default" | "warning";
}) {
  const body = (
    <div
      className={`flex h-full flex-col gap-3 rounded-2xl border p-4 transition ${
        tone === "warning"
          ? "border-warning/30 bg-warning/5 hover:bg-warning/10"
          : "border-line/70 hover:border-brand/30"
      } ${href ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full ${
            tone === "warning" ? "bg-warning/15 text-warning" : "bg-brand/10 text-brand"
          }`}
        >
          <Icon className="h-4.5 w-4.5" weight="fill" />
        </div>
        {href && <ExternalLinkIconFill className="h-4 w-4 text-faint" />}
      </div>
      <div>
        <p className="font-nunito text-2xl font-extrabold text-ink">{compactNumber(value)}</p>
        <p className="font-nunito text-xs font-semibold text-muted">{label}</p>
      </div>
      {footer && <div className="mt-auto border-t border-line/50 pt-3">{footer}</div>}
      {!footer && breakdown && breakdown.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1.5 border-t border-line/50 pt-3">
          {breakdown.map((b) => (
            <span key={b.label} className="font-nunito text-[11px] text-faint">
              {b.label} <span className="font-bold text-ink">{b.value.toLocaleString()}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

export function HqDashboard({
  stats,
  recentActivity,
  isKing,
}: {
  stats: HqStats | null;
  recentActivity: AuditLogRow[] | null;
  isKing: boolean;
}) {
  if (!stats) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10">
        <h1 className="font-nunito text-2xl font-extrabold text-ink">Village People HQ</h1>
        <p className="mt-4 rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
          Couldn&apos;t load the dashboard numbers right now — try refreshing.
        </p>
      </div>
    );
  }

  const needsAttention = stats.moderation.pending_gists + stats.moderation.pending_reports;

  return (
    <div className="hq-viz mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 md:px-10">
      <style>{HQ_VIZ_STYLE}</style>
      <div>
        <h1 className="font-nunito text-2xl font-extrabold text-ink">Village People HQ</h1>
        <p className="mt-1 font-nunito text-sm text-muted">A quick pulse on Kampos — what needs you, and how it&apos;s doing.</p>
      </div>

      {/* Needs attention */}
      <section>
        <h2 className="mb-3 font-nunito text-sm font-bold text-ink">
          Needs attention {needsAttention > 0 && <span className="text-warning">({needsAttention})</span>}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            icon={PendingIconFill}
            label="Pending gists"
            value={stats.moderation.pending_gists}
            href="/villagepeople/moderation?tab=posts"
            tone={stats.moderation.pending_gists > 0 ? "warning" : "default"}
          />
          <StatCard
            icon={PendingIconFill}
            label="Pending reports"
            value={stats.moderation.pending_reports}
            href="/villagepeople/moderation?tab=reports"
            tone={stats.moderation.pending_reports > 0 ? "warning" : "default"}
          />
        </div>
      </section>

      {/* Accounts & profiles */}
      <section>
        <h2 className="mb-3 font-nunito text-sm font-bold text-ink">Accounts &amp; profiles</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            icon={UsersIconFill}
            label="Total accounts"
            value={stats.accounts.total}
            href="/villagepeople/users"
            footer={
              <BreakdownBar
                segments={ACCOUNT_STATUS_CONFIG.map((c) => ({
                  key: c.key,
                  label: c.label,
                  color: c.color,
                  value: stats.accounts.by_status[c.key] ?? 0,
                }))}
              />
            }
          />
          <StatCard
            icon={ProfilesIconFill}
            label="Total profiles"
            value={stats.profiles.total}
            href="/villagepeople/profiles"
            footer={
              <BreakdownBar
                segments={PROFILE_TYPE_CONFIG.map((c) => ({
                  key: c.key,
                  label: c.label,
                  color: c.color,
                  value: stats.profiles.by_type[c.key] ?? 0,
                }))}
              />
            }
          />
        </div>
      </section>

      {/* Growth */}
      <section>
        <h2 className="mb-3 font-nunito text-sm font-bold text-ink">Growth</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            icon={SignupIconFill}
            label="New signups"
            value={stats.signups.today}
            breakdown={[
              { label: "Today", value: stats.signups.today },
              { label: "7 days", value: stats.signups.last_7d },
              { label: "30 days", value: stats.signups.last_30d },
            ]}
          />
          <StatCard
            icon={LoginIconFill}
            label="Logged in"
            value={stats.logins.today}
            breakdown={[
              { label: "Today", value: stats.logins.today },
              { label: "7 days", value: stats.logins.last_7d },
              { label: "30 days", value: stats.logins.last_30d },
            ]}
          />
        </div>
      </section>

      {/* Trends — signups and gists posted, each its own single-series
          chart rather than one dual-axis plot (see TrendChart.tsx's own
          doc comment for why: the two differ wildly in daily scale, and a
          shared y-axis would invent a correlation that isn't there).
          Logins deliberately aren't charted here — `last_login` only ever
          stores an account's MOST RECENT login, so a day-by-day history
          built from it would quietly undercount older days (an account
          active on day 5 and again on day 25 shows only day 25) — the
          Growth card's today/7d/30d numbers above are the honest version
          of that metric; a fabricated daily trend isn't. */}
      <section>
        <h2 className="mb-3 font-nunito text-sm font-bold text-ink">Trends (last 30 days)</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-line/70 p-4">
            <p className="mb-1 font-nunito text-xs font-semibold text-muted">Signups per day</p>
            <TrendChart data={stats.trends.signups_by_day} color="var(--series-signups)" />
          </div>
          <div className="rounded-2xl border border-line/70 p-4">
            <p className="mb-1 font-nunito text-xs font-semibold text-muted">Gists posted per day</p>
            <TrendChart data={stats.trends.gists_by_day} color="var(--series-gists)" />
          </div>
        </div>
      </section>

      {/* Engagement */}
      <section>
        <h2 className="mb-3 font-nunito text-sm font-bold text-ink">How people use Kampos</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            icon={EngagementIconFill}
            label="Gists posted"
            value={stats.engagement.gists.total}
            breakdown={[
              { label: "Today", value: stats.engagement.gists.today },
              { label: "7 days", value: stats.engagement.gists.last_7d },
            ]}
          />
          <StatCard
            icon={EngagementIconFill}
            label="Comments"
            value={stats.engagement.comments.total}
            breakdown={[{ label: "Today", value: stats.engagement.comments.today }]}
          />
          <StatCard icon={EngagementIconFill} label="Reactions" value={stats.engagement.reactions_total} />
          <StatCard icon={EngagementIconFill} label="Gist views" value={stats.engagement.gist_views_total} />
          <StatCard icon={EngagementIconFill} label="Gist shares" value={stats.engagement.gist_shares_total} />
        </div>
      </section>

      {/* Team */}
      <section>
        <h2 className="mb-3 font-nunito text-sm font-bold text-ink">Team</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            icon={AdminsIconFill}
            label="Admins"
            value={stats.admins_total}
            href={isKing ? "/villagepeople/admins" : undefined}
          />
        </div>
      </section>

      {/* Recent activity — king-only, same access tier as the Activity log
          itself (see audit/page.tsx's own doc comment: an activity feed any
          admin can browse stops functioning as a check ON admins). */}
      {isKing && recentActivity && recentActivity.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-nunito text-sm font-bold text-ink">Recent activity</h2>
            <Link href="/villagepeople/audit" className="flex items-center gap-1 font-nunito text-xs font-semibold text-brand hover:underline">
              View all
              <AuditIconFill className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ul className="flex flex-col gap-2 rounded-2xl border border-line/70 p-2">
            {recentActivity.map((row) => (
              // flex-wrap + order, not a plain one-line row: on a narrow
              // phone, TargetCell's own content (an email, a gist quote,
              // "Renamed X (tag)") can wrap to 2-3 lines, and with
              // everything vertically `items-center`'d in a single row,
              // the timestamp used to float centered against the MIDDLE
              // of that wrapped text — visually overlapping it. Badge and
              // timestamp now share their own first line (target forced
              // onto its own full-width line below via `order` + `w-full`)
              // below `sm`; at `sm` and up, `sm:order-*`/`sm:w-auto`
              // restores the original single-row layout, where there's
              // room for all three side by side.
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2.5 py-2 hover:bg-brand/5">
                <span
                  className={`order-1 shrink-0 rounded-full px-2.5 py-1 font-nunito text-[11px] font-bold ${
                    ACTION_COLOR[row.action] ?? "bg-line/20 text-muted"
                  }`}
                >
                  {ACTION_LABEL[row.action] ?? row.action}
                </span>
                <span className="order-2 ml-auto shrink-0 font-nunito text-[11px] text-faint sm:order-3 sm:ml-0">
                  {friendlyDateTime(row.created_at)}
                </span>
                <div className="order-3 w-full min-w-0 sm:order-2 sm:w-auto sm:flex-1">
                  <TargetCell row={row} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
