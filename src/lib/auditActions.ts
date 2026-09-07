/**
 * Client-safe audit-log types/constants — split out from serverAudit.ts
 * specifically because that file imports `next/headers` at module scope.
 * A client component ("use client") importing ANY real (non-type) value
 * from a module that touches next/headers drags that import into the
 * client bundle too — TypeScript's `import type` elision only saves you
 * when EVERY import from that module is type-only, and AUDIT_ACTIONS below
 * is a real runtime array a `<select>` needs to render its options, not
 * just a type. Confirmed live: AuditLogManager.tsx importing AUDIT_ACTIONS
 * straight from serverAudit.ts broke the entire app with a 500 ("You're
 * importing a module that depends on next/headers... in the Pages
 * Router") the instant it rendered — moving the value here, with
 * serverAudit.ts re-exporting it for server-side callers, fixed it.
 */
export const AUDIT_ACTIONS = [
  "PROFILE_VERIFY",
  "PROFILE_REJECT",
  "PROFILE_BAN",
  "PROFILE_UNBAN",
  "PROFILE_DELETE",
  "PROFILE_CREATE",
  "GIST_APPROVE",
  "GIST_REJECT",
  "REPORT_ACCEPT",
  "REPORT_REJECT",
  "ADMIN_GRANT",
  "ADMIN_REVOKE",
  "GIST_DELETE",
  "COMMENT_DELETE",
  "USER_CREATE",
  "USER_EMAIL_EDIT",
  "ACCOUNT_SUSPEND",
  "ACCOUNT_UNSUSPEND",
  "ACCOUNT_DELETE",
  "ADMIN_EMAIL_SENT",
  "REFERENCE_CREATE",
  "REFERENCE_UPDATE",
  "REFERENCE_DELETE",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** One row from GET /idiot/audit — see KamposBackend's audit.repo.ts
 * AuditLogRow for the exact shape this mirrors. Exactly one of the six
 * target_* enrichment fields is ever non-null on a given row, matching
 * whichever target_type it is — the backend resolves all six via LEFT
 * JOIN rather than the frontend guessing which lookup applies. */
export interface AuditLogRow {
  id: string;
  action: AuditAction;
  target_type: "PROFILE" | "GIST" | "ACCOUNT" | "COMMENT" | "CAMPUS" | "MAJOR";
  target_id: string;
  idiot_avitag: string;
  reason: string | null;
  created_at: string;
  target_email: string | null;
  target_gist_preview: string | null;
  target_comment_preview: string | null;
  target_profile_name: string | null;
  target_campus_name: string | null;
  target_major_name: string | null;
}

export interface AuditLogFilters {
  action?: AuditAction | "";
  search?: string;
  cursor?: string;
  limit?: number;
}
