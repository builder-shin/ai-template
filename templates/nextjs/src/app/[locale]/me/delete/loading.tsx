import { Skeleton } from "../../../../components/ui/skeleton";

export default function DeletionLoading() {
  return (
    <div className="mx-auto max-w-md space-y-6" aria-hidden="true">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
