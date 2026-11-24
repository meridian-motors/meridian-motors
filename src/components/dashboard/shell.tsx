"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Menu, X, LogOut, Bell, Car, CreditCard, FileText, Gauge, Heart, LayoutDashboard, LineChart, MessageSquare, Search, Settings, Sparkles, SlidersHorizontal,
  Wrench, Handshake, ShieldCheck, Users, UserCheck, ShoppingBag, MessagesSquare, Kanban, Calculator, Upload, BarChart3, Bot, ScrollText, ClipboardCheck, Tag, type LucideIcon,
} from "lucide-react";

const ICONS = { Bell, Car, CreditCard, FileText, Gauge, Heart, LayoutDashboard, LineChart, MessageSquare, Search, Settings, Sparkles, SlidersHorizontal, Wrench, Handshake,
  ShieldCheck, Users, UserCheck, ShoppingBag, MessagesSquare, Kanban, Calculator, Upload, BarChart3, Bot, ScrollText, ClipboardCheck, Tag } satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof ICONS;
import { Logo } from "@/components/site/logo";
import { cn } from "@/lib/utils";

export interface NavGroup { title: string; items: { href: string; label: string; icon: IconName; badge?: number; exact?: boolean }[] }

export function AppShell({ groups, user, children, variant = "light", footer }: {
  groups: NavGroup[]; user: { name: string; email: string; roleLabel?: string }; children: React.ReactNode; variant?: "light" | "dark"; footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const dark = variant === "dark";
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  const nav = (
    <nav className="flex-1 space-y-7 overflow-y-auto px-3 py-6" aria-label="Account navigation">
      {groups.map((g) => (
        <div key={g.title}>
          <p className={cn("mb-2 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em]", dark ? "text-white/35" : "text-muted")}>{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(item.href, item.exact);
              const Icon = ICONS[item.icon];
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={active ? "page" : undefined}
                    className={cn("flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2 text-[13.5px] transition-colors",
                      dark ? (active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white")
                           : (active ? "bg-ink text-white" : "text-slate hover:bg-mist hover:text-ink"))}>
                    <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? <span className={cn("rounded-full px-1.5 text-[10.5px] font-semibold", active || dark ? "bg-accent text-white" : "bg-accent-soft text-accent-strong")}>{item.badge}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const userBlock = (
    <div className={cn("border-t p-4", dark ? "border-white/10" : "border-line")}>
      <p className={cn("truncate text-[13px] font-medium", dark ? "text-white" : "text-ink")}>{user.name}</p>
      <p className={cn("truncate text-[12px]", dark ? "text-white/45" : "text-muted")}>{user.roleLabel ?? user.email}</p>
      <div className="mt-3 flex items-center gap-3 text-[12.5px]">
        {footer}
        <form action="/auth/signout" method="post"><button className={cn("inline-flex items-center gap-1.5", dark ? "text-white/60 hover:text-white" : "text-muted hover:text-ink")}><LogOut className="size-3.5" />Sign out</button></form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className={cn("sticky top-0 hidden h-screen flex-col border-r lg:flex", dark ? "border-white/10 bg-ink" : "border-line bg-white")}>
        <div className="flex h-[72px] items-center px-6"><Logo inverse={dark} /></div>
        {nav}
        {userBlock}
      </aside>
      <div className={cn("sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 lg:hidden", dark ? "border-white/10 bg-ink" : "border-line bg-white")}>
        <Logo inverse={dark} />
        <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} className={dark ? "text-white" : "text-ink"}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open ? <div className={cn("fixed inset-x-0 bottom-0 top-14 z-30 flex flex-col lg:hidden", dark ? "bg-ink" : "bg-white")}>{nav}{userBlock}</div> : null}
      <main id="main" className="min-w-0 px-4 py-8 sm:px-8 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
