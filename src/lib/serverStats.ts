import { cookies } from "next/headers";
import { env } from "./env";

export interface HqStats {
  accounts: { total: number; by_status: Record<string, number> };
  profiles: { total: number; by_type: Record<string, number> };
  signups: { today: number; last_7d: number; last_30d: number; total: number };
  logins: { today: number; last_7d: number; last_30d: number };
  engagement: {
    gists: { total: number; today: number; last_7d: number };
    comments: { total: number; today: number };
    reactions_total: number;
    gist_views_total: number;
    gist_shares_total: number;
  };
  moderation: { pending_gists: number; pending_reports: number };
  admins_total: number;
  trends: {
    signups_by_day: { date: string; count: number }[];
    gists_by_day: { date: string; count: number }[];
  };
}

/**
 * Server-side fetch for the HQ landing page's stat cards — same
 * cookie-forwarding, no-store, empty-shell-on-failure pattern as
 * serverAudit.ts's listAuditLogs. Any admin can call this (isIdiot, not
 * king-gated — see stats.routes.ts), so a null result here just means a
 * transient backend blip, not a permissions problem worth distinguishing.
 */
export async function getHqStats(): Promise<HqStats | null> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const res = await fetch(`${env.API_BASE}/idiot/stats/hq`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: HqStats };
    return json.data ?? null;
  } catch {
    return null;
  }
}
