"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AuthShell } from "@/components/layout/AuthShell";
import { AuthGate } from "@/components/auth/AuthGate";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { LinkText } from "@/components/ui/LinkText";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { Check } from "@/components/ui/icons";
import { useAuthStore } from "@/stores/authStore";
import { destinationFor } from "@/lib/authGate";
import {
  sanitizeInput,
  validateEmail,
  validatePassword,
  passwordsMatch,
  PASSWORD_RULES,
} from "@/lib/validation";
import { apiErrorMessage } from "@/lib/api";

export default function SignupPage() {
  return (
    <AuthGate allow={["guest"]}>
      <SignupForm />
    </AuthGate>
  );
}

/** One live rule row — the circle badge fills brand-blue with a check the
 * instant its rule passes; text darkens to match. No red "wrong" state
 * needed while typing, a rule is just unmet (muted) until it's met. */
function PasswordRuleRow({ label, met }: { label: string; met: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${
          met ? "bg-brand" : "bg-line"
        }`}
      >
        <Check
          className={`h-2.5 w-2.5 text-white transition-opacity duration-200 ${met ? "opacity-100" : "opacity-0"}`}
        />
      </span>
      <span
        className={`font-poppins text-xs transition-colors duration-200 ${met ? "text-ink" : "text-muted"}`}
      >
        {label}
      </span>
    </li>
  );
}

function SignupForm() {
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
  const passwordRuleStatus = PASSWORD_RULES.map((r) => ({ ...r, met: r.test(password) }));
  const passwordValid = passwordRuleStatus.every((r) => r.met);

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
          <h1 className="font-poppins text-2xl font-extrabold text-ink">Sign-Up</h1>
          <p className="font-poppins text-sm text-muted">
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
                  className="mt-1.5 pl-1 font-poppins text-xs text-danger"
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
            {/* Live checklist — appears once they start typing, each rule
                flips the instant it's satisfied. Replaces a single vague
                "password is wrong" error with exactly what's left to do. */}
            <AnimatePresence>
              {password.length > 0 && (
                <motion.ul
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 overflow-hidden pl-1"
                >
                  {passwordRuleStatus.map((r) => (
                    <PasswordRuleRow key={r.id} label={r.label} met={r.met} />
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
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
                  className="mt-1.5 pl-1 font-poppins text-xs text-danger"
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
                  className="mt-1.5 flex items-center gap-1 pl-1 font-poppins text-xs text-brand"
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
