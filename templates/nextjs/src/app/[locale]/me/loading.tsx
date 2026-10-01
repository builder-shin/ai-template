import { Skeleton } from "../../../components/ui/skeleton";

export default function MeLoading() {
  return (
    <div className="mx-auto max-w-md space-y-6" aria-hidden="true">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
