import "server-only";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROMPTS, type PromptKey } from "./prompts";

/** USD per million tokens (input, output). Used for cost estimates only. */
const PRICING: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-2": [8, 40],
};

export type AiTask =
  | "vehicle_enrichment" | "valuation_explanation" | "buyer_match_explanation" | "listing_generation"
  | "enquiry_analysis" | "market_intelligence" | "search_parse" | "document_extraction";

export type AiOutcome<T> =
  | { ok: true; data: T; runId: string | null; cached: boolean }
  | { ok: false; reason: "not_configured" | "disabled" | "rate_limited" | "refused" | "validation_failed" | "error"; message: string };

let client: Anthropic | null = null;
function getClient() {
  const key = serverEnv().anthropicApiKey;
  if (!key) return null;
  client ??= new Anthropic({ apiKey: key, maxRetries: 2, timeout: 45_000 });
  return client;
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number) {
  const [i, o] = PRICING[model] ?? PRICING["claude-opus-5-5"];
  return (inputTokens * i + outputTokens * o) / 1_000_000;
}

export function isAiConfigured() {
  return Boolean(serverEnv().anthropicApiKey);
}

interface RunOptions<S extends z.ZodType> {
  task: AiTask;
  prompt: PromptKey;
  schema: S;
  userContent: string;
  inputSummary: string;
  userId?: string | null;
  vehicleId?: string | null;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  cacheTtlHours?: number;      // reuse identical successful results
  dailyLimitOverride?: number;
}

/**
 * Run a structured AI task through the Claude API.
 *  - server-only; API key never reaches the browser
 *  - output validated with Zod (structured outputs + second safeParse)
 *  - every call logged to ai_runs with model, prompt version, tokens, cost, duration, status
 *  - per-user daily limits and optional result caching
 */
export async function runAiTask<S extends z.ZodType>(opts: RunOptions<S>): Promise<AiOutcome<z.infer<S>>> {
  const env = serverEnv();
  const prompt = PROMPTS[opts.prompt];
  const model = env.anthropicModel;
  const admin = createAdminClient();
  const inputHash = crypto.createHash("sha256").update(`${prompt.version}\n${opts.userContent}`).digest("hex");

  const log = async (row: Record<string, unknown>) => {
    const { data } = await admin.from("ai_runs").insert({
      user_id: opts.userId ?? null, vehicle_id: opts.vehicleId ?? null, task_type: opts.task, model,
      prompt_version: prompt.version, input_summary: opts.inputSummary.slice(0, 500), input_hash: inputHash, ...row,
    }).select("id").single();
    return (data?.id as string | undefined) ?? null;
  };

  const anthropic = getClient();
  if (!anthropic) return { ok: false, reason: "not_configured", message: "AI features are not configured (ANTHROPIC_API_KEY missing)." };

  const { data: enabled } = await admin.from("platform_settings").select("setting_value").eq("setting_key", "ai.enabled").maybeSingle();
  if (enabled && enabled.setting_value === false) {
    await log({ status: "disabled" });
    return { ok: false, reason: "disabled", message: "AI features are currently switched off by an administrator." };
  }

  // Cache
  if (opts.cacheTtlHours) {
    const since = new Date(Date.now() - opts.cacheTtlHours * 3600_000).toISOString();
    const { data: cached } = await admin.from("ai_runs").select("id, output").eq("task_type", opts.task).eq("input_hash", inputHash)
      .eq("prompt_version", prompt.version).eq("status", "success").gte("created_at", since).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (cached?.output) {
      const parsed = opts.schema.safeParse(cached.output);
      if (parsed.success) return { ok: true, data: parsed.data, runId: cached.id as string, cached: true };
    }
  }

  // Per-user daily limit
  if (opts.userId) {
    const { data: limitSetting } = await admin.from("platform_settings").select("setting_value").eq("setting_key", "ai.daily_user_limit").maybeSingle();
    const limit = opts.dailyLimitOverride ?? Number(limitSetting?.setting_value ?? 40);
    const { count } = await admin.from("ai_runs").select("id", { count: "exact", head: true }).eq("user_id", opts.userId)
      .gte("created_at", new Date(Date.now() - 86400_000).toISOString()).neq("status", "cached");
    if ((count ?? 0) >= limit) {
      await log({ status: "rate_limited" });
      return { ok: false, reason: "rate_limited", message: "You have reached today's limit for AI-assisted features. Please try again tomorrow." };
    }
  }

  const started = Date.now();
  try {
    const response = await anthropic.beta.messages.parse({
      model,
      max_tokens: opts.maxTokens ?? 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: prompt.system,
      output_config: { effort: opts.effort ?? "low", format: betaZodOutputFormat(opts.schema) },
      messages: [{ role: "user", content: opts.userContent }],
    });
    const duration = Date.now() - started;
    const usage = response.usage;
    const inputTokens = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
    const outputTokens = usage.output_tokens ?? 0;
    const base = {
      input_tokens: inputTokens, output_tokens: outputTokens, token_usage: usage as unknown as Record<string, unknown>,
      estimated_cost: estimateCost(response.model ?? model, inputTokens, outputTokens), duration_ms: duration,
    };

    if (response.stop_reason === "refusal") {
      await log({ ...base, status: "refused", error_message: "Model declined the request" });
      return { ok: false, reason: "refused", message: "The AI service declined this request." };
    }
    const validated = opts.schema.safeParse(response.parsed_output);
    if (!validated.success) {
      await log({ ...base, status: "validation_failed", error_message: validated.error.message.slice(0, 1000) });
      return { ok: false, reason: "validation_failed", message: "The AI response could not be validated, so it was discarded." };
    }
    const runId = await log({ ...base, status: "success", output: validated.data as Record<string, unknown> });
    return { ok: true, data: validated.data, runId, cached: false };
  } catch (err) {
    const duration = Date.now() - started;
    let message = "AI request failed";
    if (err instanceof Anthropic.RateLimitError) message = "AI provider rate limit reached";
    else if (err instanceof Anthropic.APIConnectionTimeoutError) message = "AI request timed out";
    else if (err instanceof Anthropic.APIError) message = `AI provider error (${err.status ?? "unknown"})`;
    await log({ status: "error", error_message: `${message}: ${String((err as Error)?.message ?? err).slice(0, 500)}`, duration_ms: duration });
    return { ok: false, reason: "error", message: "The AI service is temporarily unavailable. Please try again later." };
  }
}
