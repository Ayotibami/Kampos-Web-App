import { cookies } from "next/headers";
import { env } from "./env";

/**
 * A row from GET /idiot/admins — this is KamposBackend's PublicAccount
 * (accounts.repo.ts's Account minus password_hash): the accounts table has
 * NO avitag column at all (avitag lives on the profile tables, joined
 * separately elsewhere in the app) — so there is no handle to show here,
 * only the account's own email/role/status. `[key: string]: unknown` kept
 * for whatever else PublicAccount carries that this page doesn't otherwise
 * care about (auth_provider, oauth_id, last_login, ...).
 */
export interface AdminSummary {
  account_id: string;
  email: string;
  role: "user" | "idiot" | "king";
  account_status?: "ACTIVE" | "DELETED" | "SUSPENDED";
  is_otp_verified?: boolean;
  created_at?: string;
  [key: string]: unknown;
}

/**
 * Server-side fetch for the Admins page's initial list — same "forward the
 * incoming cookie, hit the backend directly, never cache across requests"
 * pattern as fetchGistContext/fetchStudentProfileByAvitag. Returns an empty
 * array on any failure so the page renders an empty state instead of
 * crashing (e.g. a transient backend blip, or this route not deployed yet
 * wherever this runs against).
 */
export async function listAdmins(): Promise<AdminSummary[]> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const res = await fetch(`${env.API_BASE}/idiot/admins`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: AdminSummary[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}
