import Link from "next/link";
import { Logo } from "@/components/site/logo";
import { HeroArt } from "@/components/home/hero-art";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Logo />
        <main id="main" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</main>
        <p className="text-[12px] text-muted"><Link href="/privacy" className="hover:text-ink">Privacy</Link> · <Link href="/terms" className="hover:text-ink">Terms</Link> · <Link href="/help" className="hover:text-ink">Help</Link></p>
      </div>
      <div className="relative hidden overflow-hidden bg-ink lg:flex lg:flex-col lg:justify-end">
        <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_60%_30%,rgba(168,140,99,0.18),transparent_60%)]" />
        <HeroArt className="relative mb-24 w-[120%] max-w-none -translate-x-[6%]" />
        <div className="relative p-12">
          <p className="max-w-md font-[family-name:var(--font-display)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-white">A smarter way to buy and sell cars.</p>
          <p className="mt-3 max-w-md text-[14px] text-white/55">One account to save vehicles, make enquiries and sell your own car with Fast Sale pricing.</p>
        </div>
      </div>
    </div>
  );
}
