"use client";

import { useEffect } from "react";
import { useAuthStore, type AuthGateState, type ProfileSummary } from "@/stores/authStore";
import type { Account } from "@/types";

/**
 * Seeds the auth store from a gate check the server already did (see
 * lib/serverAuth.ts's gateServer) — this is what replaced AuthGate. No
 * network call: the data's already sitting in the server-rendered props,
 * this just hands it to the client store once so hooks like
 * `useAuthStore((s) => s.user)` keep working exactly as before.
 */
export function HydrateAuth({
  state,
  account,
  profiles,
}: {
  state: AuthGateState;
  account: Account | null;
  profiles: ProfileSummary[];
}) {
  const hydrateFromServer = useAuthStore((s) => s.hydrateFromServer);
  const resolveAuthState = useAuthStore((s) => s.resolveAuthState);

  useEffect(() => {
    hydrateFromServer({ state, account, profiles });
    // The server gate only checks "does this account have a profile at
    // all," not "does the current session actually have one active" (that
    // lives in the JWT, which the gate doesn't decode) — so a session that
    // owns a profile but never switched to one (see resolveAuthState's own
    // self-heal) looks "active" here despite every authenticated write
    // failing. Re-resolving client-side for that specific case is what
    // actually fixes it, by hitting the one endpoint that does report the
    // session's real active avitag.
    if (state === "active" && profiles.length > 0 && !useAuthStore.getState().avitag) {
      void resolveAuthState();
    }
    // Deliberately only on mount — this page's own server component already
    // resolved the state fresh for this request; nothing here should
    // re-run on client-side re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
