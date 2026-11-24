import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { integrationStatus, serverEnv } from "@/lib/env";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PROMPTS } from "@/lib/ai/prompts";
import { formatDateTime, formatNumber, formatPercent } from "@/lib/format";

export const metadata = { title: "AI usage" };

export default async function AiPage() {
  await requireAdmin();
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data } = await supabase.from("ai_runs").select("id, task_type, model, prompt_version, status, input_tokens, output_tokens, estimated_cost, duration_ms, error_message, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(1000);
  const runs = data ?? [];
  const by = Object.entries(runs.reduce<Record<string, { n: number; ok: number; cost: number; tokens: number; ms: number }>>((a, r) => {
    const x = (a[r.task_type] ??= { n: 0, ok: 0, cost: 0, tokens: 0, ms: 0 }); x.n++; if (["success", "cached"].includes(r.status)) x.ok++; x.cost += Number(r.estimated_cost); x.tokens += r.input_tokens + r.output_tokens; x.ms += r.duration_ms ?? 0; return a; }, {}));
  const cost = runs.reduce((s, r) => s + Number(r.estimated_cost), 0);
  const errors = runs.filter((r) => ["error", "validation_failed"].includes(r.status)).length;
  return (
    <>
      <PageHeader eyebrow="Intelligence" title="AI usage" description="Every Claude API call is logged with model, prompt version, tokens, estimated cost, duration and status." />
      {!integrationStatus().ai ? <Alert tone="warning" className="mb-6">ANTHROPIC_API_KEY is not configured. AI features show an unavailable state; deterministic fallbacks (rule-based search parsing, template valuation explanations) are used.</Alert> : <Alert tone="neutral" className="mb-6">Model: <code>{serverEnv().anthropicModel}</code> with server-side refusal fallback. Switch AI off globally with the <code>ai.enabled</code> setting.</Alert>}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Runs (30 days)" value={formatNumber(runs.length)} /><StatCard label="Estimated cost" value={`$${cost.toFixed(2)}`} hint="Estimate from token usage" />
        <StatCard label="Tokens" value={formatNumber(runs.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0))} /><StatCard label="Error rate" value={runs.length ? formatPercent(errors / runs.length, 1) : "—"} />
      </div>
      <Card className="mb-6"><CardHeader title="By task" /><Table><THead><tr><TH>Task</TH><TH>Runs</TH><TH>Success</TH><TH>Tokens</TH><TH>Avg latency</TH><TH>Cost</TH><TH>Prompt version</TH></tr></THead><TBody>
        {by.map(([k, x]) => <TR key={k}><TD className="font-medium">{k.replace(/_/g, " ")}</TD><TD>{x.n}</TD><TD>{formatPercent(x.ok / x.n)}</TD><TD>{formatNumber(x.tokens)}</TD><TD>{x.n ? `${Math.round(x.ms / x.n)}ms` : "—"}</TD><TD>${x.cost.toFixed(3)}</TD>
          <TD className="font-mono text-[11.5px]">{Object.values(PROMPTS).find((p) => p.version.startsWith(k.split("_")[0]))?.version ?? "—"}</TD></TR>)}
        {!by.length ? <TR><TD colSpan={7} className="text-center text-muted">No AI activity in the last 30 days.</TD></TR> : null}
      </TBody></Table></Card>
      <Card><CardHeader title="Recent runs" /><Table><THead><tr><TH>Time</TH><TH>Task</TH><TH>Model</TH><TH>Status</TH><TH>Tokens</TH><TH>Cost</TH><TH>Error</TH></tr></THead><TBody>
        {runs.slice(0, 100).map((r) => <TR key={r.id}><TD className="whitespace-nowrap">{formatDateTime(r.created_at)}</TD><TD>{r.task_type.replace(/_/g, " ")}</TD><TD className="font-mono text-[11.5px]">{r.model}</TD>
          <TD><Badge tone={r.status === "success" ? "success" : r.status === "cached" ? "info" : ["error", "validation_failed", "refused"].includes(r.status) ? "danger" : "warning"}>{r.status}</Badge></TD><TD>{r.input_tokens + r.output_tokens}</TD><TD>${Number(r.estimated_cost).toFixed(4)}</TD><TD className="max-w-xs truncate text-[12px] text-muted">{r.error_message}</TD></TR>)}
      </TBody></Table></Card>
    </>
  );
}
