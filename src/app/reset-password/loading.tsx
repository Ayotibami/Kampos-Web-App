import { AuthShell } from "@/components/layout/AuthShell";
import { FormSkeleton } from "@/components/ui/FormSkeleton";

export default function Loading() {
  return (
    <AuthShell>
      <FormSkeleton />
    </AuthShell>
  );
}
