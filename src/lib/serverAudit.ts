import { cookies } from "next/headers";
import { env } from "./env";
import type { AuditLogFilters, AuditLogRow } from "./auditActions";

// Re-exported so an existing `from "@/lib/serverAudit"` server-side import
// (this page's own page.tsx) still works unchanged — the actual
// definitions live in auditActions.ts now, split out specifically so a
// CLIENT component can import the plain constants/types without also
// pulling in this file's own next/headers import (see auditActions.ts's
// own doc comment for the exact breakage that caused).
export { AUDIT_ACTIONS } from "./auditActions";
export type { AuditAction, AuditLogFilters, AuditLogRow } from "./auditActions";

/**
 * Server-side fetch for the Audit Log page's initial list — same
 * "forward the incoming cookie, hit the backend directly, no cross-request
 * cache" pattern as serverAdmins.ts's listAdmins. Empty array on any
 * failure (including a non-king caller's own 403 — the page itself
 * re-checks king-ness before ever rendering, so a real 403 here should
 * only happen from a race, not normal use) so this never crashes the page.
 */
export async function listAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogRow[]> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const params = new URLSearchParams();
    if (filters.action) params.set("action", filters.action);
    if (filters.search) params.set("search", filters.search);
    if (filters.cursor) params.set("cursor", filters.cursor);
    params.set("limit", String(filters.limit ?? 30));

    const res = await fetch(`${env.API_BASE}/idiot/audit?${params.toString()}`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: AuditLogRow[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}
