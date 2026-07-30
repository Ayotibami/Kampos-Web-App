"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { LinkText } from "@/components/ui/LinkText";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { useAuthStore } from "@/stores/authStore";
import {
  sanitizeInput,
  validateEmail,
  validatePassword,
} from "@/lib/validation";
import { apiErrorMessage } from "@/lib/api";

export default function LoginPage() {
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
    const pwIssues = validatePassword(cleanPassword);
    if (pwIssues.length) return fail(undefined, pwIssues);

    try {
      await login({ email: cleanEmail, password: cleanPassword });
      router.replace("/feed");
    } catch (err) {
      fail(apiErrorMessage(err, "Login failed"));
    }
  };

  return (
    <AppShell>
      <ErrorModal
        open={showError}
        onClose={() => setShowError(false)}
        message={message}
        passwordErrors={pwErrors}
      />
      <div className="flex flex-1 flex-col justify-center gap-7 px-6 py-10 md:px-8">
        <header className="space-y-2 text-center">
          <h1 className="font-poppins text-2xl font-extrabold text-ink">Log in</h1>
          <p className="font-poppins text-sm text-muted">
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
            className="ml-auto block font-poppins text-xs font-semibold text-brand"
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
    </AppShell>
  );
}
