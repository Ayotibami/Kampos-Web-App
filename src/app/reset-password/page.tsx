import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage() {
  // Same reasoning as /forgot-password — unverified is not the same as
  // "shouldn't be able to reset your password."
  const { state, account, profiles } = await gateServer(["guest", "needs-otp"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <ResetPasswordForm />
    </>
  );
}
