import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  // Not being OTP-verified yet has nothing to do with whether you should
  // be able to reset your password — same reasoning as /login and /signup.
  const { state, account, profiles } = await gateServer(["guest", "needs-otp"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <ForgotPasswordForm />
    </>
  );
}
