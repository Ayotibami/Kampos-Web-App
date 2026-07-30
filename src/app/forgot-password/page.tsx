"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { LinkText } from "@/components/ui/LinkText";
import { ErrorModal } from "@/components/ui/FeedbackModal";
import { useAuthStore } from "@/stores/authStore";
import { sanitizeInput, validateEmail } from "@/lib/validation";
import { apiErrorMessage } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { forgotPassword, loading } = useAuthStore();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string>();
  const [showError, setShowError] = useState(false);

  const handleSubmit = async () => {
    const clean = sanitizeInput(email);
    const emailError = validateEmail(clean);
    if (emailError) {
      setMessage("Abeg enter a valid email address.");
      setShowError(true);
      return;
    }
    try {
      await forgotPassword(clean);
      router.replace(`/reset-password?email=${encodeURIComponent(clean)}`);
    } catch (err) {
      setMessage(apiErrorMessage(err, "Failed to send OTP code"));
      setShowError(true);
    }
  };

  return (
    <AppShell>
      <ErrorModal open={showError} onClose={() => setShowError(false)} message={message} />
      <div className="flex flex-1 flex-col justify-center gap-8 px-6 py-10 md:px-8">
        <header className="space-y-3 text-center">
          <h1 className="font-poppins text-2xl font-extrabold text-ink">Forgot Password</h1>
          <p className="font-poppins text-sm text-muted">
            Enter your registered email address to recover your password.
          </p>
        </header>

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

        <div className="space-y-5">
          <Button onClick={handleSubmit} loading={loading} disabled={!email || loading}>
            Verify
          </Button>
          <LinkText normalText="Want to" linkText="Log in?" onClick={() => router.back()} />
        </div>
      </div>
    </AppShell>
  );
}
