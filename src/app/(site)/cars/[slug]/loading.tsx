import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="container-page py-10" aria-busy="true" aria-label="Loading vehicle">
      <Skeleton className="h-3 w-48" />
      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_400px]">
        <div><Skeleton className="aspect-[16/10] w-full" /><div className="mt-3 flex gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-24" />)}</div></div>
        <div className="space-y-3"><Skeleton className="h-5 w-32" /><Skeleton className="h-8 w-3/4" /><Skeleton className="h-10 w-40" /><Skeleton className="mt-6 h-96 w-full" /></div>
      </div>
    </div>
  );
}
