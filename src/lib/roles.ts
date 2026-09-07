import type { Account } from "@/types";

/**
 * Single source of truth for "does this account get into Village People
 * (/villagepeople) at all" — role 'idiot' or 'king' on the Account itself
 * (types/index.ts). Not to be confused with ProfileType's own "idiot" value
 * (a PROFILE type used for moderation-facing profiles) — this is the
 * account-level admin tier the backend now sends on /account/profile.
 *
 * Kept as its own tiny, platform-agnostic module (no next/headers, no
 * zustand) so both the server gate (serverAuth.ts — which can't be imported
 * from client code, it pulls in next/headers) and the client mirror
 * (authStore.ts) call the exact same check instead of each hardcoding the
 * same two string comparisons and risking them drifting apart.
 */
export function isAdminRole(role?: Account["role"] | string | null): boolean {
  return role === "idiot" || role === "king";
}

/**
 * The stricter tier within admin — only a 'king' account can manage other
 * admins (grant/revoke, see /villagepeople/admins). A plain 'idiot' admin
 * gets everything else in Village People minus that one page. Same sharing
 * rationale as isAdminRole: the nav (client) hides the link, the page
 * (server) actually enforces it, both need to agree on what "king" means.
 */
export function isKingRole(role?: Account["role"] | string | null): boolean {
  return role === "king";
}
