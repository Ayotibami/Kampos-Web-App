import { cookies } from "next/headers";
import { env } from "./env";

/** One row from GET /idiot/broadcasts — a past (or in-progress) mass email,
 * with live counts of how far sending has gotten. `pending_count` staying
 * above 0 for a while is normal, not broken — see broadcastSender.ts's own
 * doc comment on why a large broadcast rides out an email provider's daily
 * send quota over several days rather than all at once. */
export interface BroadcastSummary {
  broadcast_id: string;
  subject: string;
  message: string;
  sent_by_account_id: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  pending_count: number;
  created_at: string;
}

/** Server-side fetch for the Broadcasts page's initial list — same
 * "forward the incoming cookie, hit the backend directly, no cross-request
 * caching" pattern as serverAdmins.ts's listAdmins(). Empty array on any
 * failure so the page renders an empty state instead of crashing. */
export async function listBroadcasts(): Promise<BroadcastSummary[]> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const res = await fetch(`${env.API_BASE}/idiot/broadcasts`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: BroadcastSummary[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}
