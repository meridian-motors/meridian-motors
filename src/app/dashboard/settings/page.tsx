import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { ProfileForm, PreferencesForm, DeleteAccount } from "@/components/dashboard/settings-forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireUser();
  const supabase = await createClient();
  const { data: prefs } = await supabase.from("notification_preferences").select("*").eq("profile_id", session.userId).maybeSingle();
  return (
    <>
      <PageHeader eyebrow="Account" title="Settings" />
      <div className="grid max-w-3xl gap-6">
        <Card><CardHeader title="Profile" /><CardBody><ProfileForm profile={{ ...session.profile, email: session.email }} /></CardBody></Card>
        <Card><CardHeader title="Email notifications" /><CardBody><PreferencesForm prefs={(prefs ?? {}) as Record<string, boolean>} /></CardBody></Card>
        <Card><CardHeader title="Password" /><CardBody><Button asChild variant="secondary"><a href="/forgot-password">Send a password reset link</a></Button></CardBody></Card>
        <Card><CardHeader title="Your data" description="Download a copy of the personal data we hold about you." /><CardBody><Button asChild variant="secondary"><a href="/api/account/export">Download my data (JSON)</a></Button></CardBody></Card>
        <Card className="border-danger/30"><CardHeader title="Delete account" /><CardBody><DeleteAccount pending={session.profile.account_status === "pending_deletion"} /></CardBody></Card>
      </div>
    </>
  );
}
