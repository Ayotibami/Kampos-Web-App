"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/components/auth/AuthGate";
import { Button } from "@/components/ui/Button";
import { Illustration } from "@/components/brand/illustrations";

/** Post-verification celebration — ported from mobile SignUpSuccess. */
export default function SignupSuccessPage() {
  return (
    <AuthGate allow={["needs-profile"]}>
      <SignupSuccessContent />
    </AuthGate>
  );
}

function SignupSuccessContent() {
  const router = useRouter();
  return (
    <AppShell>
      <div className="flex flex-1 flex-col items-center justify-between gap-6 px-6 py-10 text-center md:px-8">
        <div className="flex flex-col items-center gap-4">
          <h1 className="font-poppins text-2xl font-extrabold text-ink">
            Sharppp, You Don Land!
          </h1>
          <p className="font-poppins text-sm font-semibold text-brand">
            Registration Complete!
          </p>
          <p className="max-w-sm font-poppins text-sm leading-relaxed text-muted">
            Wow! You don create your Kampos account! Oya collect hot pepper soup.
            Now run go set up your profile make we package your space well-well.
          </p>
          <Illustration name="Kappywithfood" className="mt-2 h-56 w-auto sm:h-64" />
        </div>

        <Button onClick={() => router.replace("/setup-profile")}>
          Set your profile
        </Button>
      </div>
    </AppShell>
  );
}
