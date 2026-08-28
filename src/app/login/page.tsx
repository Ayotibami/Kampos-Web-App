import { RedirectIfNotAllowed } from "@/components/auth/RedirectIfNotAllowed";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <>
      {/* needs-otp is allowed here too — an unverified visitor can freely
          land on /login instead of being immediately bounced to
          /verify-otp just for showing up. Only an actual login attempt
          (see LoginForm) reveals they're unverified and sends them on,
          with a fresh code (the backend already sends one automatically
          on an unverified login attempt). */}
      <RedirectIfNotAllowed allow={["guest", "needs-otp"]} />
      <LoginForm />
    </>
  );
}
