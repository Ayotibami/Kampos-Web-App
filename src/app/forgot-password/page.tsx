import { RedirectIfNotAllowed } from "@/components/auth/RedirectIfNotAllowed";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <>
      {/* Not being OTP-verified yet has nothing to do with whether you
          should be able to reset your password — same reasoning as
          /login and /signup. */}
      <RedirectIfNotAllowed allow={["guest", "needs-otp"]} />
      <ForgotPasswordForm />
    </>
  );
}
