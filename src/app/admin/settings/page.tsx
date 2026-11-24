import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { integrationStatus } from "@/lib/env";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/misc";
import { SettingEditor } from "@/components/admin/controls";

export const metadata = { title: "Settings" };

const INTEGRATIONS: Record<string, [string, string]> = {
  supabase_admin: ["Supabase service role", "SUPABASE_SERVICE_ROLE_KEY — webhooks, cron, imports, valuations"],
  ai: ["Claude API", "ANTHROPIC_API_KEY — AI search, listing generation, enrichment, enquiry triage"],
  stripe: ["Stripe", "STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET — fee and service payments"],
  email: ["Resend", "RESEND_API_KEY + EMAIL_FROM — transactional email"],
  dvla: ["DVLA Vehicle Enquiry Service", "DVLA_VES_API_KEY — registration lookups"],
};

export default async function SettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("*").order("setting_key");
  const integ = integrationStatus();
  return (
    <>
      <PageHeader eyebrow="System" title="Platform settings" description="Business rules are stored here, not in code. Every change is written to the audit log." />
      <Card className="mb-8"><CardHeader title="Integrations" description="Secrets are read from environment variables and are never shown here." /><CardBody>
        <ul className="divide-y divide-line">{Object.entries(INTEGRATIONS).map(([k, [name, desc]]) => <li key={k} className="flex items-center justify-between gap-4 py-3 text-[13.5px]"><span><strong>{name}</strong><span className="block text-[12px] text-muted">{desc}</span></span>
          <Badge tone={integ[k as keyof typeof integ] ? "success" : "warning"}>{integ[k as keyof typeof integ] ? "Configured" : "Not configured"}</Badge></li>)}
          <li className="flex items-center justify-between gap-4 py-3 text-[13.5px]"><span><strong>Licensed history checks</strong><span className="block text-[12px] text-muted">Finance, stolen, write-off and mileage checks require a licensed provider contract.</span></span><Badge>Not connected</Badge></li>
        </ul></CardBody></Card>
      <div className="grid gap-4 lg:grid-cols-2">{(data ?? []).map((s) => <SettingEditor key={s.id} settingKey={s.setting_key} value={s.setting_value} description={s.description} />)}</div>
    </>
  );
}
