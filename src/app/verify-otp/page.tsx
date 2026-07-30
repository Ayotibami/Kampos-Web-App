"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { OtpInputs } from "@/components/ui/OtpInputs";
import { LinkText } from "@/components/ui/LinkText";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { useAuthStore } from "@/stores/authStore";
import { getPendingSignup, clearPendingSignup } from "@/lib/signupSession";
import { apiErrorMessage } from "@/lib/api";
import { formatCountdown } from "@/lib/format";
import { LIMITS } from "@/lib/brand";

const OTP_TTL = 5 * 60; // seconds

export default function VerifyOtpPage() {
  const router = useRouter();
  const { verifyOtp, sendOtp, login, user, loading } = useAuthStore();

  const email = user?.email ?? getPendingSignup()?.email ?? "";
  const [digits, setDigits] = useState<string[]>(Array(LIMITS.otp).fill(""));
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL);
  const [wrong, setWrong] = useState(false);
  const [message, setMessage] = useState<string>();
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => (s <= 0 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  const code = useMemo(() => digits.join(""), [digits]);
  const complete = code.length === LIMITS.otp;
  const canResend = secondsLeft <= OTP_TTL - 20; // after ~20s, like mobile

  const handleVerify = async () => {
    try {
      await verifyOtp({ email, code });
      // Auto-login with the credentials held in memory from signup.
      const pending = getPendingSignup();
      if (pending) {
        await login({ email: pending.email, password: pending.password });
        clearPendingSignup();
      }
      router.replace("/signup-success");
    } catch (err) {
      const msg = apiErrorMessage(err, "Invalid code");
      if (msg === "Invalid or expired code") {
        setWrong(true);
      } else {
        setMessage(msg);
        setShowError(true);
      }
    }
  };

  const handleResend = async () => {
    try {
      await sendOtp(email);
      setSecondsLeft(OTP_TTL);
      setDigits(Array(LIMITS.otp).fill(""));
      setWrong(false);
    } catch (err) {
      setMessage(apiErrorMessage(err, "Failed to send OTP"));
      setShowError(true);
    }
  };

  const heading = wrong ? "Invalid code" : secondsLeft <= 0 ? "Expired code" : "Confirm code";
  const helper = wrong
    ? "Incorrect code. Check your email or resend the code if not received. Don't forget your spam folder."
    : secondsLeft <= 0
      ? "The current code has expired. Please request a new code."
      : "We've sent an email with a code to complete your account. Please enter it below to continue.";

  return (
    <AppShell>
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={message} />
      <div className="flex flex-1 flex-col justify-between gap-8 px-6 py-10 md:px-8">
        <div className="space-y-6">
          <h1 className="font-poppins text-2xl font-extrabold text-ink">Sign-Up</h1>
          <p className="font-poppins text-sm font-semibold text-brand">{heading}</p>
          <p className="font-poppins text-sm text-muted">{helper}</p>

          <OtpInputs value={digits} onChange={setDigits} error={wrong} length={LIMITS.otp} />

          <p className="text-center font-poppins text-sm text-muted">
            {secondsLeft <= 0 ? "Oops, time up! Abeg resend code " : "The code expires in "}
            {secondsLeft > 0 && (
              <span
                className="font-bold"
                style={{
                  color:
                    secondsLeft < 30
                      ? "var(--color-danger)"
                      : secondsLeft <= 150
                        ? "#D4C40C"
                        : "var(--color-brand)",
                }}
              >
                {formatCountdown(secondsLeft)}
              </span>
            )}
          </p>
        </div>

        <div className="space-y-5">
          {canResend ? (
            <LinkText
              normalText="Didn't receive code?"
              linkText="Resend"
              onClick={handleResend}
              disabled={loading}
            />
          ) : (
            <p className="text-center font-poppins text-sm text-muted">
              Hang on! You can resend in{" "}
              <span className="font-semibold text-brand">{secondsLeft - (OTP_TTL - 20)}s</span>
            </p>
          )}

          <Button onClick={handleVerify} loading={loading} disabled={!complete || loading}>
            Verify
          </Button>

          <LinkText
            normalText="Need to"
            linkText="change email?"
            onClick={() => router.replace("/signup")}
          />
        </div>
      </div>
    </AppShell>
  );
}
