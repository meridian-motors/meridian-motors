import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="container-page py-12" aria-busy="true" aria-label="Loading vehicles">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-9 w-64" />
      <Skeleton className="mt-6 h-14 w-full" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[290px_1fr]">
        <Skeleton className="hidden h-[640px] lg:block" />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-[var(--radius-md)] border border-line bg-white">
              <Skeleton className="aspect-[4/3] rounded-none" />
              <div className="space-y-2 p-4"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="mt-4 h-8 w-full" /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
