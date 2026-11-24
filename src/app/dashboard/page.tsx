import Link from "next/link";
import { ArrowRight, Bell, Car, CircleAlert, Eye, Heart, Handshake, MessageSquare, Plus, Trophy } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Alert } from "@/components/ui/alert";
import { formatNumber, timeAgo } from "@/lib/format";

export const metadata = { title: "Dashboard" };

type Stats = { active_listings: number; pending_listings: number; drafts: number; awaiting_your_approval: number; total_views: number; total_saves: number;
  total_enquiries: number; new_enquiries: number; receiving_interest: number; sales_in_progress: number; completed_sales: number;
  outstanding_actions: { type: string; vehicle_id?: string; payment_id?: string; label: string }[] };

export default async function DashboardHome({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: stats }, { data: notifications }, { count: saved }, { count: buyerEnquiries }] = await Promise.all([
    supabase.rpc("seller_dashboard_stats"),
    supabase.from("notifications").select("id, title, message, link, created_at, read_at").eq("profile_id", session.userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("saved_vehicles").select("id", { count: "exact", head: true }),
    session.buyerId ? supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("buyer_id", session.buyerId) : Promise.resolve({ count: 0 }),
  ]);
  const s = (stats ?? {}) as Stats;
  const isSeller = !!session.sellerId && (s.active_listings + s.pending_listings + s.drafts + s.awaiting_your_approval + s.sales_in_progress + s.completed_sales) > 0;
  const actionHref = (a: Stats["outstanding_actions"][number]) =>
    a.type === "complete_submission" ? `/dashboard/vehicles/${a.vehicle_id}/submit` : a.type === "pay_fee" ? "/dashboard/payments" : `/dashboard/vehicles/${a.vehicle_id}`;

  return (
    <>
      <PageHeader eyebrow="My account" title={`Welcome${session.profile.first_name ? `, ${session.profile.first_name}` : ""}`}
        description="Everything you are buying and selling on Meridian Motors."
        actions={<><Button asChild variant="secondary"><Link href="/cars">Browse cars</Link></Button><Button asChild><Link href="/dashboard/vehicles/new"><Plus /> Sell a vehicle</Link></Button></>} />
      {sp.password === "updated" ? <Alert tone="success" className="mb-6">Your password has been updated.</Alert> : null}

      {s.outstanding_actions?.length ? (
        <Card className="mb-8 border-accent/40">
          <CardHeader title="Outstanding actions" description="Things that need your attention." />
          <ul className="divide-y divide-line">
            {s.outstanding_actions.map((a, i) => (
              <li key={i}>
                <Link href={actionHref(a)} className="flex items-center justify-between gap-4 px-5 py-3.5 text-[14px] hover:bg-paper">
                  <span className="flex items-center gap-3"><CircleAlert className="size-4 shrink-0 text-accent" />{a.label}</span><ArrowRight className="size-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <h2 className="mb-4 text-[15px] font-semibold">Selling</h2>
      {isSeller ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Active listings" value={formatNumber(s.active_listings)} icon={<Car />} hint={`${s.pending_listings} in review · ${s.drafts} draft`} />
          <StatCard label="Total views" value={formatNumber(s.total_views)} icon={<Eye />} hint={`${formatNumber(s.total_saves)} saves`} />
          <StatCard label="Enquiries" value={formatNumber(s.total_enquiries)} icon={<MessageSquare />} hint={`${s.new_enquiries} new · ${s.receiving_interest} vehicle(s) with recent interest`} tone="accent" />
          <StatCard label="Sales" value={formatNumber(s.completed_sales)} icon={<Trophy />} hint={`${s.sales_in_progress} in progress · ${s.awaiting_your_approval} awaiting your approval`} />
        </div>
      ) : (
        <Card><EmptyState icon={<Car />} title="You aren't selling anything yet"
          description="Submit your vehicle to receive an indicative valuation and a professionally prepared listing. It's free until you sell."
          action={<Button asChild><Link href="/dashboard/vehicles/new">Start a submission</Link></Button>} /></Card>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Buying" action={<Button asChild variant="link" size="sm"><Link href="/dashboard/saved">View saved</Link></Button>} />
          <CardBody className="grid grid-cols-2 gap-4">
            <Link href="/dashboard/saved" className="rounded-[var(--radius-sm)] border border-line p-4 hover:border-silver"><Heart className="size-4 text-accent" /><p className="mt-3 text-2xl font-semibold">{saved ?? 0}</p><p className="text-[12.5px] text-muted">Saved vehicles</p></Link>
            <Link href="/dashboard/buying" className="rounded-[var(--radius-sm)] border border-line p-4 hover:border-silver"><Handshake className="size-4 text-accent" /><p className="mt-3 text-2xl font-semibold">{buyerEnquiries ?? 0}</p><p className="text-[12.5px] text-muted">Your enquiries</p></Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Recent notifications" action={<Button asChild variant="link" size="sm"><Link href="/dashboard/notifications">View all</Link></Button>} />
          {notifications?.length ? (
            <ul className="divide-y divide-line">
              {notifications.map((n) => (
                <li key={n.id} className="px-5 py-3">
                  <Link href={n.link ?? "/dashboard/notifications"} className="block">
                    <p className="flex items-center gap-2 text-[13.5px] font-medium text-ink">{!n.read_at ? <span className="size-1.5 rounded-full bg-accent" /> : null}{n.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-[12.5px] text-muted">{n.message} · {timeAgo(n.created_at)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<Bell />} title="No notifications yet" className="py-10" />}
        </Card>
      </div>
    </>
  );
}
