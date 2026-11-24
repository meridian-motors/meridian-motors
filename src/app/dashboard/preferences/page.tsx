import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { PreferencesEditor } from "@/components/buyer/preferences-editor";

export const metadata = { title: "Buying preferences" };

export default async function PreferencesPage() {
  const session = await requireUser("/dashboard/preferences");
  const supabase = await createClient();
  const [{ data: prefs }, { data: buyer }] = await Promise.all([
    supabase.from("buyer_preferences").select("*").maybeSingle(),
    session.buyerId ? supabase.from("buyers").select("matching_opt_in").eq("id", session.buyerId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Buying" title="Buying preferences" description="Tell us what you're looking for and we'll rank vehicles by how well they match. We only use the vehicle preferences you give us." />
      <Card className="max-w-3xl"><CardBody><PreferencesEditor prefs={prefs} optIn={!!buyer?.matching_opt_in} /></CardBody></Card>
    </>
  );
}
