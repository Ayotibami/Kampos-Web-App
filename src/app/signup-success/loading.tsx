import { AppShell } from "@/components/layout/AppShell";
import { FormSkeleton } from "@/components/ui/FormSkeleton";

export default function Loading() {
  return (
    <AppShell>
      <div className="flex w-full flex-col justify-center p-6">
        <FormSkeleton />
      </div>
    </AppShell>
  );
}
