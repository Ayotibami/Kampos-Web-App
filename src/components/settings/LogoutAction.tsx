"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/FeedbackModal";
import { LogOut } from "@/components/ui/icons";
import { useAuthStore } from "@/stores/authStore";

/** The logout trigger + its confirm modal, shared by the mobile Settings
 * hub and the desktop rail's footer so the flow only exists once. */
export function LogoutAction({ fullWidth = false }: { fullWidth?: boolean }) {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    router.replace("/login");
  };

  return (
    <>
      <ConfirmModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleLogout}
        title="Oya naw, later things?"
        message="You go need login again next time you wan gist."
        confirmLabel="Log Out"
        loading={loggingOut}
        icon={<LogOut size={24} strokeWidth={2} />}
      />
      <Button
        variant="secondary"
        fullWidth={fullWidth}
        className="!border-danger !text-danger hover:!bg-danger/5"
        onClick={() => setShowConfirm(true)}
      >
        Logout
      </Button>
    </>
  );
}
