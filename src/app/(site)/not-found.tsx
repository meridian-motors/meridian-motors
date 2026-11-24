import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[55vh] flex-col items-center justify-center py-20 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 text-3xl font-semibold">This page isn&apos;t available</h1>
      <p className="mt-2 max-w-md text-[14px] text-muted">The vehicle may have been sold or withdrawn, or the link may be incorrect.</p>
      <div className="mt-6 flex gap-3"><Button asChild><Link href="/cars">Browse vehicles</Link></Button><Button asChild variant="secondary"><Link href="/">Home</Link></Button></div>
    </div>
  );
}
