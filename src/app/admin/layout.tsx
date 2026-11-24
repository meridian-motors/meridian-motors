import type { Metadata } from "next";
import { AppShell, type NavGroup } from "@/components/dashboard/shell";
import { requireStaff, displayName, isAdminRole } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Meridian Admin" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff(); // server-side role check; non-staff get a 404
  const admin = isAdminRole(session.profile.role);
  const supabase = await createClient();
  const [{ count: review }, { count: newEnq }] = await Promise.all([
    supabase.from("vehicles").select("id", { count: "exact", head: true }).in("vehicle_status", ["submitted", "approved_for_publication"]).is("deleted_at", null),
    supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("enquiry_status", "new"),
  ]);
  const groups: NavGroup[] = [
    { title: "Operations", items: [
      { href: "/admin", label: "Overview", icon: "LayoutDashboard", exact: true },
      { href: "/admin/inventory", label: "Inventory", icon: "Car" },
      { href: "/admin/listings", label: "Listing approval", icon: "ClipboardCheck", badge: review ?? 0 },
      { href: "/admin/sales", label: "Sales pipeline", icon: "Kanban" },
      { href: "/admin/enquiries", label: "Enquiries", icon: "MessageSquare", badge: newEnq ?? 0 },
      { href: "/admin/conversations", label: "Conversations", icon: "MessagesSquare" },
    ] },
    { title: "Customers", items: [
      { href: "/admin/sellers", label: "Sellers", icon: "UserCheck" },
      { href: "/admin/buyers", label: "Buyers", icon: "ShoppingBag" },
      ...(admin ? [{ href: "/admin/users", label: "Users & roles", icon: "Users" as const }] : []),
    ] },
    { title: "Intelligence", items: [
      { href: "/admin/valuations", label: "Valuations", icon: "LineChart" },
      { href: "/admin/pricing", label: "Pricing engine", icon: "Calculator" },
      { href: "/admin/analytics", label: "Analytics", icon: "BarChart3" },
      ...(admin ? [{ href: "/admin/ai", label: "AI usage", icon: "Bot" as const }] : []),
    ] },
    { title: "Commercial", items: [
      { href: "/admin/payments", label: "Payments", icon: "CreditCard" },
      { href: "/admin/services", label: "Services", icon: "Wrench" },
      ...(admin ? [{ href: "/admin/imports", label: "Import centre", icon: "Upload" as const }] : []),
    ] },
    ...(admin ? [{ title: "System", items: [
      { href: "/admin/settings", label: "Settings", icon: "Settings" as const },
      { href: "/admin/audit-logs", label: "Audit logs", icon: "ScrollText" as const },
    ] }] : []),
  ];
  return (
    <AppShell variant="dark" groups={groups} user={{ name: displayName(session.profile), email: session.email, roleLabel: ROLE_LABELS[session.profile.role] }}
      footer={<a href="/dashboard" className="text-white/60 hover:text-white">My account</a>}>
      {children}
    </AppShell>
  );
}
