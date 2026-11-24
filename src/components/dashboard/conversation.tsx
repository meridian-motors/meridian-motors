"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { postMessage } from "@/app/actions/seller";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = { buyer: "Buyer", seller: "Seller", staff: "Meridian Motors", system: "System" };

export function ConversationThread({ conversationId, messages, viewerRole, canReply = true, buyerName }: {
  conversationId: string; messages: Message[]; viewerRole: "buyer" | "seller" | "staff"; canReply?: boolean; buyerName?: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <ol className="space-y-3">
        {messages.map((m) => {
          const mine = m.sender_role === viewerRole;
          return (
            <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-[var(--radius-md)] px-4 py-3 text-[14px] leading-relaxed", mine ? "bg-ink text-white" : m.sender_role === "staff" ? "border border-accent/30 bg-accent-soft/40 text-charcoal" : "border border-line bg-white text-charcoal")}>
                <p className={cn("mb-1 text-[11px] font-medium", mine ? "text-white/60" : "text-muted")}>{mine ? "You" : m.sender_role === "buyer" && buyerName ? buyerName : ROLE_LABEL[m.sender_role]} · {formatDateTime(m.created_at)}</p>
                <p className="whitespace-pre-line">{m.message}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {canReply ? (
        <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); start(async () => { setError(null); const r = await postMessage(conversationId, text); if (!r.ok) setError(r.error); else { setText(""); router.refresh(); } }); }}>
          <Textarea aria-label="Your message" rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} placeholder="Write a reply…" className="flex-1" />
          <Button type="submit" disabled={pending || !text.trim()} className="sm:self-end">{pending ? <Loader2 className="animate-spin" /> : <Send />}Send</Button>
        </form>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-danger">{error}</p> : null}
      <p className="mt-3 text-[11.5px] text-muted">For your safety, keep communication on Meridian Motors. Never share bank details in messages, and never pay for a vehicle before seeing it.</p>
    </div>
  );
}
