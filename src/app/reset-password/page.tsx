import { RedirectIfNotAllowed } from "@/components/auth/RedirectIfNotAllowed";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <>
      {/* Same reasoning as /forgot-password — unverified is not the same
          as "shouldn't be able to reset your password." */}
      <RedirectIfNotAllowed allow={["guest", "needs-otp"]} />
      <ResetPasswordForm />
    </>
  );
}
