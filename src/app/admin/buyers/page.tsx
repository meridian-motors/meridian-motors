import { requireStaff, displayName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatPrice } from "@/lib/format";

export const metadata = { title: "Buyers" };

export default async function BuyersPage() {
  await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.from("buyers").select("id, matching_opt_in, minimum_budget, maximum_budget, created_at, profiles!inner(email, first_name, last_name), buyer_preferences(preferred_makes, maximum_mileage), saved_vehicles(count), enquiries(count), buyer_matches(count)").order("created_at", { ascending: false }).limit(300);
  return (
    <>
      <PageHeader eyebrow="Customers" title="Buyers" description="Buyer accounts and their stated preferences. Matching uses only these stated preferences." />
      <Card><Table><THead><tr><TH>Buyer</TH><TH>Budget</TH><TH>Preferences</TH><TH>Saved</TH><TH>Enquiries</TH><TH>Matches</TH><TH>Matching</TH><TH>Joined</TH></tr></THead><TBody>
        {(data ?? []).map((b) => { const p = b.profiles as unknown as { email: string; first_name: string | null; last_name: string | null }; const pref = (b.buyer_preferences as unknown as { preferred_makes: string[]; maximum_mileage: number | null } | null);
          const c = (x: unknown) => (x as { count: number }[])?.[0]?.count ?? 0;
          return <TR key={b.id}><TD><span className="font-medium">{displayName(p)}</span><span className="block text-[12px] text-muted">{p.email}</span></TD>
            <TD>{b.maximum_budget ? `${formatPrice(b.minimum_budget ?? 0)}–${formatPrice(b.maximum_budget)}` : "—"}</TD><TD className="text-[12.5px]">{pref?.preferred_makes?.join(", ") || "—"}</TD>
            <TD>{c(b.saved_vehicles)}</TD><TD>{c(b.enquiries)}</TD><TD>{c(b.buyer_matches)}</TD><TD>{b.matching_opt_in ? <Badge tone="success">Opted in</Badge> : <Badge>Off</Badge>}</TD><TD>{formatDate(b.created_at)}</TD></TR>; })}
      </TBody></Table></Card>
    </>
  );
}
