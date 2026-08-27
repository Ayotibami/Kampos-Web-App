import { AppShell } from "@/components/layout/AppShell";
import { FormSkeleton } from "@/components/ui/FormSkeleton";

export default function Loading() {
  return (
    <AppShell variant="landscape">
      <div className="flex w-full flex-1 flex-col justify-center p-6 md:p-10">
        <FormSkeleton />
      </div>
    </AppShell>
  );
}
