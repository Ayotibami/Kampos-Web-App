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
  passwordsMatch,
} from "@/lib/validation";
import { setPendingSignup } from "@/lib/signupSession";
import { apiErrorMessage } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [message, setMessage] = useState<string>();
  const [pwErrors, setPwErrors] = useState<string[]>([]);
  const [showError, setShowError] = useState(false);

  const fail = (msg?: string, list: string[] = []) => {
    setMessage(msg);
    setPwErrors(list);
    setShowError(true);
  };

  const handleSignup = async () => {
    const cleanEmail = sanitizeInput(email);
    const cleanPassword = sanitizeInput(password);

    const emailError = validateEmail(cleanEmail);
    if (emailError) return fail(emailError);
    if (!passwordsMatch(cleanPassword, confirm))
      return fail("Almost there — your passwords need to match.");
    const pwIssues = validatePassword(cleanPassword);
    if (pwIssues.length) return fail(undefined, pwIssues);

    try {
      const { token, user } = await register({ email: cleanEmail, password: cleanPassword });
      if (token && user) {
        // Held in memory only, for auto-login after OTP verification.
        setPendingSignup({ email: cleanEmail, password: cleanPassword });
        router.replace("/verify-otp");
      }
    } catch (err) {
      fail(apiErrorMessage(err, "Registration failed"));
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
      <div className="flex flex-1 flex-col justify-center gap-6 px-6 py-10 md:px-8">
        <header className="space-y-2 text-center">
          <h1 className="font-poppins text-2xl font-extrabold text-ink">Sign-Up</h1>
          <p className="font-poppins text-sm text-muted">
            Oya join Kampos na — make you catch all the latest gists, events,
            updates and stories for your campus.
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
            autoComplete="new-password"
            maxLength={32}
          />
          <TextInput
            value={confirm}
            onChange={setConfirm}
            placeholder="Retype Password"
            isPassword
            autoComplete="new-password"
            maxLength={32}
          />

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--color-brand)]"
            />
            <span className="font-poppins text-xs leading-relaxed text-muted">
              By signing up, you agree to Kampos{" "}
              <span className="font-semibold text-brand">Terms &amp; Conditions</span> &amp;{" "}
              <span className="font-semibold text-brand">Privacy Policy</span>
            </span>
          </label>
        </div>

        <div className="space-y-5">
          <Button
            onClick={handleSignup}
            loading={loading}
            disabled={!email || !password || !confirm || !agree || loading}
          >
            Confirm
          </Button>
          <LinkText
            normalText="Account already exists?"
            linkText="Log in."
            onClick={() => router.push("/login")}
          />
        </div>
      </div>
    </AppShell>
  );
}
