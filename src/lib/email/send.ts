import "server-only";
import { Resend } from "resend";
import { serverEnv } from "@/lib/env";

export type SendResult = { status: "sent"; id: string } | { status: "unconfigured" } | { status: "failed"; error: string };

let resend: Resend | null = null;

export async function sendEmail(to: string, subject: string, html: string, text: string, opts?: { unsubscribeUrl?: string }): Promise<SendResult> {
  const env = serverEnv();
  if (!env.resendApiKey) return { status: "unconfigured" };
  resend ??= new Resend(env.resendApiKey);
  try {
    const { data, error } = await resend.emails.send({
      from: env.emailFrom, to, subject, html, text,
      headers: opts?.unsubscribeUrl ? { "List-Unsubscribe": `<${opts.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
    });
    if (error || !data) return { status: "failed", error: error?.message ?? "unknown" };
    return { status: "sent", id: data.id };
  } catch (e) {
    return { status: "failed", error: String(e) };
  }
}
