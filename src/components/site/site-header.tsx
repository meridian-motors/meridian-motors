"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Heart, LayoutDashboard, Menu, Shield, User, X } from "lucide-react";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/cars", label: "Buy a car" },
  { href: "/sell", label: "Sell your car" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
];

export function SiteHeader({ user, transparent = false }: { user: { name: string; isStaff: boolean } | null; transparent?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!transparent) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [transparent]);
  const dark = transparent && !scrolled && !open;

  return (
    <header className={cn("sticky top-0 z-40 transition-colors duration-300", dark ? "bg-transparent" : "border-b border-line bg-white/95 backdrop-blur")}>
      <div className="container-page flex h-16 items-center justify-between gap-6 lg:h-[72px]">
        <Logo inverse={dark} />
        <nav className="hidden items-center gap-8 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className={cn("text-[13.5px] font-medium transition-colors", dark ? "text-white/80 hover:text-white" : "text-slate hover:text-ink",
                pathname.startsWith(n.href) && (dark ? "text-white" : "text-ink"))}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm" className={cn(dark && "text-white hover:bg-white/10")}>
                <Link href="/dashboard/saved"><Heart /> Saved</Link>
              </Button>
              {user.isStaff ? (
                <Button asChild variant="ghost" size="sm" className={cn(dark && "text-white hover:bg-white/10")}>
                  <Link href="/admin"><Shield /> Admin</Link>
                </Button>
              ) : null}
              <Button asChild variant={dark ? "inverse" : "primary"} size="sm">
                <Link href="/dashboard"><LayoutDashboard /> My account</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className={cn(dark && "text-white hover:bg-white/10")}>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild variant={dark ? "inverse" : "primary"} size="sm">
                <Link href="/sell">Get a valuation</Link>
              </Button>
            </>
          )}
        </div>
        <button className={cn("rounded-[var(--radius-sm)] p-2 lg:hidden", dark ? "text-white" : "text-ink")} onClick={() => setOpen((o) => !o)}
          aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open ? (
        <div id="mobile-nav" className="border-t border-line bg-white lg:hidden">
          <nav className="container-page flex flex-col py-4" aria-label="Mobile">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="border-b border-line py-3.5 text-[15px] font-medium text-ink">{n.label}</Link>
            ))}
            <div className="mt-5 grid grid-cols-2 gap-3">
              {user ? (
                <>
                  <Button asChild variant="secondary"><Link href="/dashboard/saved"><Heart /> Saved</Link></Button>
                  <Button asChild><Link href="/dashboard"><User /> Account</Link></Button>
                  {user.isStaff ? <Button asChild variant="secondary" className="col-span-2"><Link href="/admin"><Shield /> Admin</Link></Button> : null}
                </>
              ) : (
                <>
                  <Button asChild variant="secondary"><Link href="/login">Sign in</Link></Button>
                  <Button asChild><Link href="/register">Create account</Link></Button>
                </>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
