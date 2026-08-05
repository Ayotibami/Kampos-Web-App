"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { LinkText } from "@/components/ui/LinkText";
import { ErrorModal, SuccessModal } from "@/components/ui/FeedbackModal";
import { useAuthStore } from "@/stores/authStore";
import { sanitizeInput, validatePassword, passwordsMatch } from "@/lib/validation";
import { apiErrorMessage } from "@/lib/api";
import { LIMITS } from "@/lib/brand";

function ResetPasswordInner() {
  const router = useRouter();
  const email = useSearchParams().get("email") ?? "";
  const { resetPassword, forgotPassword, loading } = useAuthStore();

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string>();
  const [pwErrors, setPwErrors] = useState<string[]>([]);
  const [showError, setShowError] = useState(false);
  const [successText, setSuccessText] = useState<string>();
  const [showSuccess, setShowSuccess] = useState(false);
  const [resendIn, setResendIn] = useState(30);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const fail = (msg?: string, list: string[] = []) => {
    setMessage(msg);
    setPwErrors(list);
    setShowError(true);
  };

  const handleReset = async () => {
    const cleanPw = sanitizeInput(password);
    const cleanConfirm = sanitizeInput(confirm);
    if (!passwordsMatch(cleanPw, cleanConfirm))
      return fail("Almost there — your passwords need to match.");
    const issues = validatePassword(cleanPw);
    if (issues.length) return fail(undefined, issues);

    try {
      await resetPassword({ email, code, newPassword: cleanPw });
      setSuccessText("Your password was reset successfully. Please use your new password to hop in.");
      setShowSuccess(true);
      setTimeout(() => router.replace("/login"), 2000);
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to reset password"));
    }
  };

  const handleResend = async () => {
    try {
      await forgotPassword(email);
      setSuccessText("A new password reset code has been sent to your email.");
      setShowSuccess(true);
      setResendIn(30);
      setCode("");
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to resend code"));
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
      <SuccessModal open={showSuccess} onClose={() => setShowSuccess(false)} message={successText} />

      <div className="flex flex-col gap-8">
        <div className="space-y-5">
          <h1 className="font-poppins text-2xl font-extrabold text-ink">Reset Password</h1>
          <p className="font-poppins text-sm font-semibold text-brand">Create a New Password</p>
          <p className="font-poppins text-sm text-muted">
            Your password reset code is on the way! Check your email — and don&apos;t forget your
            spam folder too.
          </p>

          <div className="space-y-4">
            <TextInput
              value={code}
              onChange={(v) => setCode(v.replace(/\D/g, ""))}
              placeholder="Enter six digit code"
              inputMode="numeric"
              maxLength={LIMITS.otp}
            />
            <TextInput
              value={password}
              onChange={setPassword}
              placeholder="New password"
              isPassword
              autoComplete="new-password"
              maxLength={32}
            />
            <TextInput
              value={confirm}
              onChange={setConfirm}
              placeholder="Confirm password"
              isPassword
              autoComplete="new-password"
              maxLength={32}
            />
          </div>

          <div className="space-y-1">
            <p className="font-poppins text-xs text-muted">The code expires in 5 minutes.</p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resendIn > 0}
              className="font-poppins text-xs font-semibold text-brand disabled:text-muted"
            >
              {resendIn > 0 ? `Wanna resend code? wait ${resendIn}s` : "Resend code"}
            </button>
          </div>
        </div>

        <div className="space-y-5">
          <Button
            onClick={handleReset}
            loading={loading}
            disabled={!code || !password || !confirm || loading}
          >
            Reset
          </Button>
          <LinkText
            normalText="New here?"
            linkText="Create an Account"
            onClick={() => router.replace("/signup")}
          />
        </div>
      </div>
    </AuthShell>
  );
}

export function ResetPasswordForm() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
