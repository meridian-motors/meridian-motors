import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { markNotificationsRead } from "@/app/actions/seller";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ActionButton } from "@/components/dashboard/small-actions";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const session = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").eq("profile_id", session.userId).order("created_at", { ascending: false }).limit(100);
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  return (
    <>
      <PageHeader eyebrow="Overview" title="Notifications" actions={unread ? <ActionButton variant="secondary" action={markNotificationsRead.bind(null, undefined)}>Mark all as read</ActionButton> : null} />
      <Card>
        {!data?.length ? <EmptyState icon={<Bell />} title="You're all caught up" /> : (
          <ul className="divide-y divide-line">
            {data.map((n) => (
              <li key={n.id} className={n.read_at ? "" : "bg-accent-soft/20"}>
                <Link href={n.link ?? "#"} className="flex gap-3 px-5 py-4 hover:bg-paper">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-line" : "bg-accent"}`} />
                  <span className="min-w-0"><span className="block text-[14px] font-medium text-ink">{n.title}</span><span className="block text-[13px] text-slate">{n.message}</span><span className="mt-1 block text-[12px] text-muted">{formatDateTime(n.created_at)}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
