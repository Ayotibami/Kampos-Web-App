"use client";

import { useEffect, useRef, useState } from "react";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { ErrorModal, SuccessModal, ConfirmModal } from "@/components/ui/FeedbackModal";
import { AlertTriangle, DeleteIconFill, Search } from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";
import { useAdminStore, type AdminSummary } from "@/stores/adminStore";
import { useUserManagementStore, type AccountSearchRow } from "@/stores/userManagementStore";

const SEARCH_DEBOUNCE_MS = 300;

function adminLabel(admin: AdminSummary | null): string {
  if (!admin) return "This admin";
  // Accounts have no avitag column at all (see serverAdmins.ts) — email is
  // the only identity a /idiot/admins row actually carries.
  return admin.email || admin.account_id;
}

/**
 * Client half of /villagepeople/admins — the server page.tsx does the
 * king-only gate + initial listAdmins() fetch; this owns everything
 * interactive (grant search, revoke confirm), same split as e.g.
 * settings/account's page.tsx + AccountManagementForm.
 *
 * Grant searches ACCOUNTS by email (GET /idiot/users?search=..., the same
 * endpoint/store the Accounts page itself uses — userManagementStore's
 * searchUsers), not profiles by avitag. Role lives on accounts.role, not on
 * any profile row, and an account can be a perfectly valid admin with zero
 * profiles at all — an earlier version of this form resolved an avitag
 * through the student-profile endpoint (the only lookup that existed yet
 * at the time it was written), which meant it could only ever grant admin
 * to someone whose ACTIVE profile happened to be a student's. Searching
 * accounts directly has no such blind spot.
 */
export function AdminsManager({ initialAdmins }: { initialAdmins: AdminSummary[] }) {
  const [admins, setAdmins] = useState<AdminSummary[]>(initialAdmins);
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<AccountSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AdminSummary | null>(null);
  const [revoking, setRevoking] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string>();
  const [showError, setShowError] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>();
  const [showSuccess, setShowSuccess] = useState(false);

  const searchUsers = useUserManagementStore((s) => s.searchUsers);
  const grantAdmin = useAdminStore((s) => s.grantAdmin);
  const revokeAdmin = useAdminStore((s) => s.revokeAdmin);
  const refreshAdmins = useAdminStore((s) => s.refreshAdmins);

  const fail = (msg: string) => {
    setErrorMessage(msg);
    setShowError(true);
  };
  const succeed = (msg: string) => {
    setSuccessMessage(msg);
    setShowSuccess(true);
  };

  // Debounced type-ahead — same 300ms pattern the Profiles/All Gists
  // search bars already use. Clears results (rather than leaving a stale
  // dropdown open) the moment the box is emptied.
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const query = searchInput.trim();
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!query) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const results = await searchUsers({ search: query, limit: 8 });
        setSearchResults(results);
      } catch (err) {
        fail(apiErrorMessage(err, "Failed to search accounts"));
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const handleGrant = async (account: AccountSearchRow) => {
    setGrantingId(account.account_id);
    try {
      await grantAdmin(account.account_id);
      // Re-fetch rather than splice a synthetic row together locally —
      // grant's own response carries no `data` (see adminStore.ts), so the
      // full PublicAccount row (email, role, status, ...) only exists on
      // the list endpoint anyway.
      try {
        setAdmins(await refreshAdmins());
      } catch {
        /* grant itself succeeded; the list just didn't refresh — not fatal */
      }
      setSearchInput("");
      setSearchResults([]);
      succeed(`${account.email} don become admin!`);
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to grant admin"));
    } finally {
      setGrantingId(null);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeAdmin(revokeTarget.account_id);
      setAdmins((prev) => prev.filter((a) => a.account_id !== revokeTarget.account_id));
      setRevokeTarget(null);
      succeed(`${adminLabel(revokeTarget)} don lose admin access.`);
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to revoke admin"));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <>
      <SuccessModal open={showSuccess} onClose={() => setShowSuccess(false)} message={successMessage} />
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={errorMessage} />
      <ConfirmModal
        open={!!revokeTarget}
        onClose={() => (revoking ? undefined : setRevokeTarget(null))}
        onConfirm={handleRevoke}
        title="Revoke admin access?"
        message={`${adminLabel(revokeTarget)} go lose admin access right away.`}
        confirmLabel="Revoke"
        icon={<AlertTriangle size={26} strokeWidth={2} />}
        loading={revoking}
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10 md:px-10">
        <div>
          <h1 className="font-nunito text-2xl font-extrabold text-ink">Admins</h1>
          <p className="mt-1 font-nunito text-sm text-muted">
            Grant or revoke admin access. Only king accounts can see this page.
          </p>
        </div>

        <section className="flex flex-col gap-3 rounded-2xl border border-line/70 p-5">
          <h2 className="font-nunito text-sm font-bold text-ink">Grant admin</h2>
          <p className="font-nunito text-xs text-muted">
            Search by email — any account, with or without a profile.
          </p>
          <div className="relative">
            <TextInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search by email"
              autoComplete="off"
              autoCapitalize="none"
              trailingIcon={<Search className="h-4 w-4 text-muted" />}
            />

            {searchInput.trim() && (
              <div className="absolute inset-x-0 top-full z-10 mt-2 flex flex-col gap-1 rounded-2xl border border-line/70 bg-surface p-2 shadow-lg">
                {searching ? (
                  <p className="p-3 text-center font-nunito text-xs text-muted">Searching…</p>
                ) : searchResults.length === 0 ? (
                  <p className="p-3 text-center font-nunito text-xs text-muted">No accounts match this search.</p>
                ) : (
                  searchResults.map((account) => {
                    const alreadyAdmin = account.role === "idiot" || account.role === "king";
                    return (
                      <div
                        key={account.account_id}
                        className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-brand/5"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-nunito text-sm font-semibold text-ink">{account.email}</p>
                          <p className="font-nunito text-xs text-muted">{account.role ?? "user"}</p>
                        </div>
                        <Button
                          fullWidth={false}
                          className="!px-4 !py-2 text-sm"
                          loading={grantingId === account.account_id}
                          disabled={alreadyAdmin || grantingId !== null}
                          onClick={() => handleGrant(account)}
                        >
                          {alreadyAdmin ? "Already admin" : "Make idiot"}
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-nunito text-sm font-bold text-ink">Current admins</h2>
          {admins.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line/70 p-6 text-center font-nunito text-sm text-muted">
              No admins to show yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {admins.map((admin) => (
                <li
                  key={admin.account_id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-line/70 p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-nunito text-sm font-semibold text-ink">{adminLabel(admin)}</p>
                    {admin.role && <p className="font-nunito text-xs text-muted">{admin.role}</p>}
                  </div>
                  {admin.role === "king" ? (
                    // King's own role can't be changed through this route
                    // (admins.controller.ts rejects it outright) — showing
                    // a Revoke button here would just be a guaranteed-to-
                    // fail dead click.
                    <span className="font-nunito text-xs font-medium text-faint">Can&apos;t be revoked</span>
                  ) : (
                    <Button
                      variant="secondary"
                      fullWidth={false}
                      onClick={() => setRevokeTarget(admin)}
                      className="!border-danger !text-danger hover:!bg-danger/5"
                    >
                      <DeleteIconFill className="h-4 w-4" />
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
