"use client";

import { useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { LinkText } from "@/components/ui/LinkText";
import { ErrorModal, ConfirmModal } from "@/components/ui/FeedbackModal";
import { useAuthStore } from "@/stores/authStore";
import { destinationFor } from "@/lib/authGate";
import { sanitizeInput, validateEmail } from "@/lib/validation";
import { apiErrorMessage } from "@/lib/api";

/** `code` (ACCOUNT_SUSPENDED/ACCOUNT_DELETED/ACCOUNT_DEACTIVATED, see
 * KamposBackend's auth.service.ts blockedAccountError) — only login's own
 * response carries this, so it's read here rather than folded into the
 * shared apiErrorMessage/ApiEnvelope, which every other call site uses too. */
function loginErrorCode(err: unknown): string | undefined {
  if (!axios.isAxiosError(err)) return undefined;
  const data = err.response?.data as { code?: string } | undefined;
  return data?.code;
}

export function LoginForm() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const reactivateAccount = useAuthStore((s) => s.reactivateAccount);
  const loading = useAuthStore((s) => s.loading);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const [pwErrors, setPwErrors] = useState<string[]>([]);
  const [showError, setShowError] = useState(false);
  // ACCOUNT_DEACTIVATED is the one blocked-login case with a real way
  // forward — SUSPENDED/DELETED just show their own already-complete,
  // branded message via the generic ErrorModal below (auth.service.ts's
  // blockedAccountError already writes the full "reach out to us"-style
  // copy into that message, no separate UI needed for those two).
  const [showReactivatePrompt, setShowReactivatePrompt] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  const fail = (msg?: string, list: string[] = []) => {
    setMessage(msg);
    setPwErrors(list);
    setShowError(true);
  };

  const handleLogin = async () => {
    const cleanEmail = sanitizeInput(email);
    const cleanPassword = sanitizeInput(password);

    const emailError = validateEmail(cleanEmail);
    if (emailError) return fail(emailError);
    // Only presence is checked here — strength rules (8+ chars, mixed case,
    // etc.) belong on signup/reset, not login. Re-applying them here could
    // reject a real account's password that predates today's rules; the
    // backend is the actual authority on whether credentials are valid.
    if (!cleanPassword) return fail("Password is required");

    try {
      const state = await login({ email: cleanEmail, password: cleanPassword });
      router.replace(destinationFor(state));
    } catch (err) {
      if (loginErrorCode(err) === "ACCOUNT_DEACTIVATED") {
        setShowReactivatePrompt(true);
        return;
      }
      fail(apiErrorMessage(err, "Login failed"));
    }
  };

  const handleReactivate = async () => {
    setReactivating(true);
    try {
      const state = await reactivateAccount(sanitizeInput(email), sanitizeInput(password));
      setShowReactivatePrompt(false);
      router.replace(destinationFor(state));
    } catch (err) {
      setReactivating(false);
      setShowReactivatePrompt(false);
      fail(apiErrorMessage(err, "Failed to reactivate account"));
    }
  };

  return (
    <AuthShell>
      <ErrorModal
        open={showError}
        onClose={() => setShowError(false)}
        message={message}
        passwordErrors={pwErrors}
      />
      <ConfirmModal
        open={showReactivatePrompt}
        onClose={() => (reactivating ? undefined : setShowReactivatePrompt(false))}
        onConfirm={handleReactivate}
        title="Welcome back!"
        message="You deactivated this account — nothing was lost while you were away. Reactivate it now and you're good to go."
        confirmLabel="Reactivate"
        loading={reactivating}
      />
      <div className="flex flex-col gap-7">
        <header className="space-y-2 text-center">
          <h1 className="font-nunito text-2xl font-extrabold text-ink">Log in</h1>
          <p className="font-nunito text-sm text-muted">
            No waste time na—dive right into the rants, stories and happenings
            wey dey sup for your campus.
          </p>
        </header>

        <div className="space-y-4">
          <TextInput
            value={email}
            onChange={setEmail}
            placeholder="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            maxLength={50}
          />
          <TextInput
            value={password}
            onChange={setPassword}
            placeholder="Password"
            isPassword
            autoComplete="current-password"
            maxLength={32}
          />
          <button
            type="button"
            onClick={() => router.push("/forgot-password")}
            className="ml-auto block font-nunito text-xs font-semibold text-brand"
          >
            Forgot Password?
          </button>
        </div>

        <div className="space-y-5">
          <Button
            onClick={handleLogin}
            loading={loading}
            disabled={!email || !password || loading}
          >
            Log in
          </Button>
          <LinkText
            normalText="New here?"
            linkText="Create an Account"
            onClick={() => router.push("/signup")}
          />
        </div>
      </div>
    </AuthShell>
  );
}
