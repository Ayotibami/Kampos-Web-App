"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { OtpInputs } from "@/components/ui/OtpInputs";
import { LinkText } from "@/components/ui/LinkText";
import { ErrorModal, SuccessModal } from "@/components/ui/FeedbackModal";
import { useAuthStore } from "@/stores/authStore";
import {
  sanitizeInput,
  validatePassword,
  passwordsMatch,
} from "@/lib/validation";
import { apiErrorMessage } from "@/lib/api";
import { LIMITS } from "@/lib/brand";

type Stage = "code" | "password";

function ResetPasswordInner() {
  const router = useRouter();
  const email = useSearchParams().get("email") ?? "";
  const { verifyResetCode, resetPassword, forgotPassword, loading } =
    useAuthStore();

  const [stage, setStage] = useState<Stage>("code");
  const [digits, setDigits] = useState<string[]>(Array(LIMITS.otp).fill(""));
  const [wrong, setWrong] = useState(false);
  // Same reasoning as verify-otp's OtpInputs usage — a plain boolean can't
  // replay the shake for two wrong attempts in a row (React bails out of
  // re-rendering on an unchanged `true`), so this needs a value guaranteed
  // to change on every occurrence, not every transition.
  const [shakeSignal, setShakeSignal] = useState(0);

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

  const code = digits.join("");
  const complete = code.length === LIMITS.otp;

  const fail = (msg?: string, list: string[] = []) => {
    setMessage(msg);
    setPwErrors(list);
    setShowError(true);
  };

  const handleVerifyCode = async () => {
    try {
      await verifyResetCode({ email, code });
      setStage("password");
    } catch (err) {
      const msg = apiErrorMessage(err, "Invalid code");
      if (msg === "Invalid or expired code") {
        setWrong(true);
        setShakeSignal((n) => n + 1);
      } else {
        fail(msg);
      }
    }
  };

  const handleReset = async () => {
    const cleanPw = sanitizeInput(password);
    const cleanConfirm = sanitizeInput(confirm);
    if (!passwordsMatch(cleanPw, cleanConfirm))
      return fail("Almost there — your passwords need to match.");
    const issues = validatePassword(cleanPw);
    if (issues.length) return fail(undefined, issues);

    try {
      // Still sends the code along — verifyResetCode above only *previews*
      // whether it's right, it never consumes it. This call is the one
      // that actually checks it for real and burns it, same as before.
      await resetPassword({ email, code, newPassword: cleanPw });
      setSuccessText(
        "Your password was reset successfully. Please use your new password to hop in.",
      );
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
      setDigits(Array(LIMITS.otp).fill(""));
      setWrong(false);
      setStage("code");
    } catch (err) {
      fail(apiErrorMessage(err, "Failed to resend code"));
    }
  };

  const heading = wrong ? "Invalid code" : "Confirm code";
  const helper = wrong
    ? "Incorrect code. Check your email or resend the code if not received. Don't forget your spam folder."
    : "Your password reset code is on the way! Check your email — and don't forget your spam folder too.";

  return (
    <AuthShell>
      <ErrorModal
        open={showError}
        onClose={() => setShowError(false)}
        message={message}
        passwordErrors={pwErrors}
      />
      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        message={successText}
      />

      {stage === "code" ? (
        <div className="flex flex-col gap-8">
          <div className="space-y-5 text-center">
            <h1 className="font-poppins text-2xl font-extrabold text-ink">
              Reset Password
            </h1>
            <p
              className={`font-poppins text-sm font-semibold ${wrong ? "text-danger" : "text-brand"}`}
            >
              {heading}
            </p>
            <p className="font-poppins text-sm text-muted">{helper}</p>

            <OtpInputs
              value={digits}
              onChange={(next) => {
                setWrong(false);
                setDigits(next);
              }}
              error={wrong}
              shakeSignal={shakeSignal}
              length={LIMITS.otp}
            />

            <div className="space-y-1">
              <p className="text-center font-poppins text-xs text-muted">
                The code expires in 10 minutes.
              </p>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendIn > 0}
                className="block w-full text-center font-poppins text-xs font-semibold text-brand disabled:text-muted"
              >
                {resendIn > 0
                  ? `Wanna resend code? wait ${resendIn}s`
                  : "Resend code"}
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <Button
              onClick={handleVerifyCode}
              loading={loading}
              disabled={!complete || loading}
            >
              Continue
            </Button>
            <LinkText
              normalText="New here?"
              linkText="Create an Account"
              onClick={() => router.replace("/signup")}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="space-y-5">
            <div className="space-y-5 text-center">
              <h1 className="font-poppins text-2xl font-extrabold text-ink">
                Reset Password
              </h1>
              <p className="font-poppins text-sm font-semibold text-brand">
                Create a New Password
              </p>
              <p className="font-poppins text-sm text-muted">
                Code confirmed — create your new password.
              </p>
            </div>

            <div className="space-y-4">
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
          </div>

          <div className="space-y-5">
            <Button
              onClick={handleReset}
              loading={loading}
              disabled={!password || !confirm || loading}
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
      )}
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
