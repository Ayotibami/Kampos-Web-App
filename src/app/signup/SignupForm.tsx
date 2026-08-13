"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { LinkText } from "@/components/ui/LinkText";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { PasswordChecklist, isPasswordValid } from "@/components/ui/PasswordChecklist";
import { useAuthStore } from "@/stores/authStore";
import { destinationFor } from "@/lib/authGate";
import { env } from "@/lib/env";
import { sanitizeInput, validateEmail, validatePassword, passwordsMatch } from "@/lib/validation";
import { Check } from "@/components/ui/icons";
import { apiErrorMessage } from "@/lib/api";

export function SignupForm() {
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

  // Only starts showing an email error once the user has actually left the
  // field (blur) — validating every keystroke would flag a half-typed
  // address as "wrong" the whole time they're typing it. Once shown, it
  // re-validates live so it clears the instant they fix it.
  const [emailTouched, setEmailTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  const emailError = emailTouched ? validateEmail(sanitizeInput(email)) : null;
  const confirmMismatch = confirmTouched && confirm.length > 0 && confirm !== password;
  const passwordValid = isPasswordValid(password);

  const fail = (msg?: string, list: string[] = []) => {
    setMessage(msg);
    setPwErrors(list);
    setShowError(true);
  };

  const handleSignup = async () => {
    const cleanEmail = sanitizeInput(email);
    const cleanPassword = sanitizeInput(password);

    const emailErr = validateEmail(cleanEmail);
    if (emailErr) {
      setEmailTouched(true);
      return fail(emailErr);
    }
    if (!passwordsMatch(cleanPassword, confirm)) {
      setConfirmTouched(true);
      return fail("Almost there — your passwords need to match.");
    }
    const pwIssues = validatePassword(cleanPassword);
    if (pwIssues.length) return fail(undefined, pwIssues);

    try {
      // Registering already logs the account in (the server sets the auth
      // cookies on this response) — just unverified, so this always lands
      // on /verify-otp next, no separate re-login step needed.
      const state = await register({ email: cleanEmail, password: cleanPassword });
      router.replace(destinationFor(state));
    } catch (err) {
      fail(apiErrorMessage(err, "Registration failed"));
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
      <div className="flex flex-col gap-6">
        <header className="space-y-2 text-center">
          <h1 className="font-nunito text-2xl font-extrabold text-ink">Sign-Up</h1>
          <p className="font-nunito text-sm text-muted">
            Oya join Kampos na — make you catch all the latest gists, events,
            updates and stories for your campus.
          </p>
        </header>

        <div className="space-y-4">
          <div>
            <TextInput
              value={email}
              onChange={setEmail}
              onBlur={() => setEmailTouched(true)}
              placeholder="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              maxLength={50}
              error={!!emailError}
            />
            <AnimatePresence>
              {emailError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="mt-1.5 pl-1 font-nunito text-xs text-danger"
                >
                  {emailError}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <div>
            <TextInput
              value={password}
              onChange={setPassword}
              placeholder="Password"
              isPassword
              autoComplete="new-password"
              maxLength={32}
            />
            <PasswordChecklist password={password} />
          </div>

          <div>
            <TextInput
              value={confirm}
              onChange={setConfirm}
              onBlur={() => setConfirmTouched(true)}
              placeholder="Retype Password"
              isPassword
              autoComplete="new-password"
              maxLength={32}
              error={confirmMismatch}
            />
            <AnimatePresence>
              {confirmMismatch && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="mt-1.5 pl-1 font-nunito text-xs text-danger"
                >
                  Passwords don&apos;t match.
                </motion.p>
              )}
              {confirmTouched && confirm.length > 0 && confirm === password && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="mt-1.5 flex items-center gap-1 pl-1 font-nunito text-xs text-brand"
                >
                  <Check className="h-3 w-3" /> Passwords match
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--color-brand)]"
            />
            <span className="font-nunito text-xs leading-relaxed text-muted">
              By signing up, you agree to Kampos{" "}
              <a
                href={env.TERMS_URL}
                target="_blank"
                rel="noopener noreferrer"
                // Stops the click from also bubbling up to the <label> and
                // toggling the checkbox — without this, tapping the link
                // text both opens it in a new tab AND flips `agree`.
                onClick={(e) => e.stopPropagation()}
                className="font-semibold text-brand underline underline-offset-2"
              >
                Terms &amp; Conditions
              </a>{" "}
              &amp;{" "}
              <a
                href={env.PRIVACY_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-semibold text-brand underline underline-offset-2"
              >
                Privacy Policy
              </a>
            </span>
          </label>
        </div>

        <div className="space-y-5">
          <Button
            onClick={handleSignup}
            loading={loading}
            disabled={
              !email ||
              !password ||
              !confirm ||
              !agree ||
              !passwordValid ||
              confirm !== password ||
              loading
            }
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
    </AuthShell>
  );
}
