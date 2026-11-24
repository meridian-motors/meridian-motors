import type { Metadata } from "next";
import { AppShell, type NavGroup } from "@/components/dashboard/shell";
import { requireUser, displayName, isStaffRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { default: "My account", template: "%s | My account | Meridian Motors" }, robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  const supabase = await createClient();
  const [{ count: unread }, { count: newEnquiries }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("profile_id", session.userId).is("read_at", null),
    session.sellerId ? supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("seller_id", session.sellerId).eq("enquiry_status", "new") : Promise.resolve({ count: 0 }),
  ]);
  const groups: NavGroup[] = [
    { title: "Overview", items: [
      { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", exact: true },
      { href: "/dashboard/notifications", label: "Notifications", icon: "Bell", badge: unread ?? 0 },
    ] },
    { title: "Selling", items: [
      { href: "/dashboard/vehicles", label: "My vehicles", icon: "Car" },
      { href: "/dashboard/valuations", label: "Valuations", icon: "LineChart" },
      { href: "/dashboard/enquiries", label: "Enquiries", icon: "MessageSquare", badge: newEnquiries ?? 0 },
      { href: "/dashboard/sales", label: "Sales", icon: "Handshake" },
      { href: "/dashboard/services", label: "Services", icon: "Wrench" },
      { href: "/dashboard/documents", label: "Documents", icon: "FileText" },
      { href: "/dashboard/payments", label: "Payments", icon: "CreditCard" },
    ] },
    { title: "Buying", items: [
      { href: "/dashboard/saved", label: "Saved vehicles", icon: "Heart" },
      { href: "/dashboard/searches", label: "Saved searches", icon: "Search" },
      { href: "/dashboard/recommendations", label: "Recommended", icon: "Sparkles" },
      { href: "/dashboard/buying", label: "My enquiries", icon: "Gauge" },
      { href: "/dashboard/preferences", label: "Preferences", icon: "SlidersHorizontal" },
    ] },
    { title: "Account", items: [{ href: "/dashboard/settings", label: "Settings", icon: "Settings" }] },
  ];
  return (
    <AppShell groups={groups} user={{ name: displayName(session.profile), email: session.email }}
      footer={<>{isStaffRole(session.profile.role) ? <a href="/admin" className="text-muted hover:text-ink">Admin</a> : null}<a href="/cars" className="text-muted hover:text-ink">Marketplace</a></>}>
      {children}
    </AppShell>
  );
}
