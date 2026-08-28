import { RedirectIfNotAllowed } from "@/components/auth/RedirectIfNotAllowed";
import { SignupForm } from "./SignupForm";

export default function SignupPage() {
  return (
    <>
      {/* needs-otp allowed too, same reasoning as /login — see there. */}
      <RedirectIfNotAllowed allow={["guest", "needs-otp"]} />
      <SignupForm />
    </>
  );
}
