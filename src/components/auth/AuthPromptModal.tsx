"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Illustration } from "@/components/brand/illustrations";
import { useAuthPromptStore } from "@/stores/authPromptStore";

/** The one shared "you need an account" prompt — see requireAuth() and
 * authPromptStore. Mounted once in the root layout, so it's always
 * available regardless of which page/component triggers it. */
export function AuthPromptModal() {
  const { open, action, close } = useAuthPromptStore();

  return (
    <Modal open={open} onClose={close}>
      <div className="rounded-3xl bg-surface-2 p-6 text-center shadow-2xl">
        <Illustration name="Kappywithphone" className="mx-auto h-32 w-auto" />
        <h2 className="mt-3 font-poppins text-lg font-extrabold text-ink">
          Oya, join Kampos first
        </h2>
        <p className="mt-1.5 font-poppins text-sm text-muted">
          {action ? `Sign up to ${action} — free, takes a minute.` : "Sign up to continue — free, takes a minute."}
        </p>
        <div className="mt-5 space-y-2.5">
          <Link href="/signup" className="block">
            <Button variant="primary" onClick={close}>
              Sign up
            </Button>
          </Link>
          <Link href="/login" className="block">
            <Button variant="secondary" onClick={close}>
              I already have an account
            </Button>
          </Link>
        </div>
      </div>
    </Modal>
  );
}
