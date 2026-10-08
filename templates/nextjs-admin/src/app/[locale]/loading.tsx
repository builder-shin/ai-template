import { Skeleton } from "../../components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6 py-10">
      <Skeleton className="h-8 w-48 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-3/4 max-w-md motion-reduce:animate-none" />
      <Skeleton className="h-32 w-full motion-reduce:animate-none" />
    </div>
  );
}
