"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { OtpInputs } from "@/components/ui/OtpInputs";
import { LinkText } from "@/components/ui/LinkText";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { notifyAuthToast } from "@/components/auth/AuthToast";
import { useAuthStore } from "@/stores/authStore";
import { destinationFor } from "@/lib/authGate";
import { apiErrorMessage } from "@/lib/api";
import { formatCountdown } from "@/lib/format";
import { LIMITS } from "@/lib/brand";

const OTP_TTL = 10 * 60; // seconds — matches the backend's real OTP expiry

export function VerifyOtpForm() {
  const router = useRouter();
  const { verifyOtp, sendOtp, logout, user, loading } = useAuthStore();

  // AuthGate only renders this once resolveAuthState has confirmed
  // "needs-otp" — which means an account (and its email) definitely exists.
  const email = user?.email ?? "";
  const [digits, setDigits] = useState<string[]>(Array(LIMITS.otp).fill(""));
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL);
  const [wrong, setWrong] = useState(false);
  const [message, setMessage] = useState<string>();
  const [showError, setShowError] = useState(false);
  // Bumped whenever the boxes should shake — a submit-time wrong code, or
  // the timer running out from under someone. Can't just derive this from
  // `wrong`/`secondsLeft <= 0` as a boolean: two wrong attempts in a row
  // both leave `wrong` sitting at `true` the whole time, so nothing about
  // that value actually changes on the second attempt for an effect to
  // catch — this needs to change on every occurrence, not every transition.
  const [shakeSignal, setShakeSignal] = useState(0);

  // No auto-send on mount — register and login both already trigger a code
  // send server-side (register always; login whenever the account isn't
  // yet verified), and this page is only ever reached right after one of
  // those. Sending again here doubled every single email. Someone landing
  // on a genuinely stale unverified session (rare — would mean returning
  // without ever logging in again in between) just uses the Resend button
  // below, same as anyone whose code expired.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => (s <= 0 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  // Shakes the boxes the moment the timer actually runs out from under
  // someone — not just when they try to submit a now-expired code. Fires
  // exactly once: secondsLeft only ever transitions into 0 a single time,
  // the interval above stops itself right after.
  useEffect(() => {
    if (secondsLeft === 0) setShakeSignal((n) => n + 1);
  }, [secondsLeft]);

  const code = useMemo(() => digits.join(""), [digits]);
  const complete = code.length === LIMITS.otp;
  const canResend = secondsLeft <= OTP_TTL - 20; // after ~20s, like mobile

  const handleVerify = async () => {
    try {
      const state = await verifyOtp({ email, code });
      notifyAuthToast("otp-verified");
      router.replace(destinationFor(state));
    } catch (err) {
      const msg = apiErrorMessage(err, "Invalid code");
      if (msg === "Invalid or expired code") {
        setWrong(true);
        setShakeSignal((n) => n + 1);
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
    <AuthShell>
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={message} />
      <div className="flex flex-col gap-8">
        <div className="space-y-6 text-center">
          <h1 className="font-nunito text-2xl font-extrabold text-ink">Verify OTP</h1>
          <p
            className={`font-nunito text-sm font-semibold ${
              wrong || secondsLeft <= 0 ? "text-danger" : "text-brand"
            }`}
          >
            {heading}
          </p>
          <p className="font-nunito text-sm text-muted">{helper}</p>

          <OtpInputs
            value={digits}
            onChange={setDigits}
            error={wrong || secondsLeft <= 0}
            shakeSignal={shakeSignal}
            length={LIMITS.otp}
          />

          <p className="text-center font-nunito text-sm text-muted">
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
            // Deliberately small/muted/uncolored, unlike the big countdown
            // above — that one and this one are both ticking numbers on
            // screen at once for these first 20s, and without a clear
            // visual difference they read as two competing timers instead
            // of "code expiry" vs. "resend cooldown." Explicit wording for
            // the same reason: a bare "20s" next to "4:52" is ambiguous
            // about which clock it even belongs to.
            <p className="text-center font-nunito text-xs text-faint">
              Resend available in {secondsLeft - (OTP_TTL - 20)}s
            </p>
          )}

          <Button onClick={handleVerify} loading={loading} disabled={!complete || loading}>
            Verify
          </Button>

          <LinkText
            normalText="Need to"
            linkText="change email?"
            onClick={async () => {
              // This account/session is being abandoned in favor of a
              // fresh one — /signup only allows guests, so the current
              // (unverified) session has to actually end first, not just
              // navigate away from.
              await logout();
              router.replace("/signup");
            }}
          />
        </div>
      </div>
    </AuthShell>
  );
}
