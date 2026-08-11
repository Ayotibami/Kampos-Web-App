"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { LinkText } from "@/components/ui/LinkText";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { useAuthStore } from "@/stores/authStore";
import { destinationFor } from "@/lib/authGate";
import { sanitizeInput, validateEmail } from "@/lib/validation";
import { apiErrorMessage } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const [pwErrors, setPwErrors] = useState<string[]>([]);
  const [showError, setShowError] = useState(false);

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
      fail(apiErrorMessage(err, "Login failed"));
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
