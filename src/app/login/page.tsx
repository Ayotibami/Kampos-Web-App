import { gateServer } from "@/lib/serverAuth";
import { HydrateAuth } from "@/components/auth/HydrateAuth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  // needs-otp is allowed here too — an unverified visitor can freely land
  // on /login instead of being immediately bounced to /verify-otp just for
  // showing up. Only an actual login attempt (see LoginForm) reveals
  // they're unverified and sends them on, with a fresh code (the backend
  // already sends one automatically on an unverified login attempt).
  const { state, account, profiles } = await gateServer(["guest", "needs-otp"]);
  return (
    <>
      <HydrateAuth state={state} account={account} profiles={profiles} />
      <LoginForm />
    </>
  );
}
