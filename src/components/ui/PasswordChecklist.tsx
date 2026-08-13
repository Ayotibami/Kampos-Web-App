"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check } from "@/components/ui/icons";
import { PASSWORD_RULES } from "@/lib/validation";

/** One live rule row — the circle badge fills brand-blue with a check the
 * instant its rule passes; text darkens to match. No red "wrong" state
 * needed while typing, a rule is just unmet (muted) until it's met. */
function PasswordRuleRow({ label, met }: { label: string; met: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${
          met ? "bg-brand" : "bg-line"
        }`}
      >
        <Check
          className={`h-2.5 w-2.5 text-white transition-opacity duration-200 ${met ? "opacity-100" : "opacity-0"}`}
        />
      </span>
      <span
        className={`font-nunito text-xs transition-colors duration-200 ${met ? "text-ink" : "text-muted"}`}
      >
        {label}
      </span>
    </li>
  );
}

/** Live password-rule checklist, shared by signup and account-management's
 * change-password field — appears once typing starts, each rule flips the
 * instant it's satisfied. Replaces a single vague "password is wrong" error
 * with exactly what's left to do. */
export function PasswordChecklist({ password }: { password: string }) {
  const ruleStatus = PASSWORD_RULES.map((r) => ({ ...r, met: r.test(password) }));
  return (
    <AnimatePresence>
      {password.length > 0 && (
        <motion.ul
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 overflow-hidden pl-1"
        >
          {ruleStatus.map((r) => (
            <PasswordRuleRow key={r.id} label={r.label} met={r.met} />
          ))}
        </motion.ul>
      )}
    </AnimatePresence>
  );
}

/** Whether every rule currently passes — gates submit the same way
 * validatePassword's empty-array check does, without re-running the rules. */
export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(password));
}
