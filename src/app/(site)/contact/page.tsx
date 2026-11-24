import type { Metadata } from "next";
import { Mail, MessageSquare, Scale } from "lucide-react";
import { ContentHero } from "@/components/site/content";
import { ContactForm } from "@/components/site/contact-form";

export const metadata: Metadata = { title: "Contact", description: "Contact Meridian Motors about buying, selling, your account, complaints or data protection.", alternates: { canonical: "/contact" } };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  return (
    <>
      <ContentHero eyebrow="Contact" title="How can we help?" intro="Send us a message and a member of the Meridian team will reply, usually within one working day." />
      <div className="container-page grid gap-12 py-14 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[var(--radius-md)] border border-line bg-white p-6 sm:p-8"><ContactForm defaultTopic={topic} /></div>
        <aside className="space-y-6 text-[14px] leading-relaxed text-slate">
          <div className="flex gap-3"><MessageSquare className="mt-0.5 size-5 shrink-0 text-accent" strokeWidth={1.5} /><div><p className="font-medium text-ink">About a specific vehicle?</p><p>Use the enquiry form on the vehicle&apos;s page so your message reaches the right team with the vehicle details attached.</p></div></div>
          <div className="flex gap-3"><Scale className="mt-0.5 size-5 shrink-0 text-accent" strokeWidth={1.5} /><div><p className="font-medium text-ink">Complaints</p><p>Choose &ldquo;Complaint&rdquo; as the topic. We acknowledge complaints within two working days and aim to resolve them within eight weeks. [LEGAL REVIEW: complaints procedure and any ADR scheme.]</p></div></div>
          <div className="flex gap-3"><Mail className="mt-0.5 size-5 shrink-0 text-accent" strokeWidth={1.5} /><div><p className="font-medium text-ink">Data protection requests</p><p>Choose &ldquo;Data protection&rdquo; to request access to, correction of or deletion of your personal data. Signed-in users can also request account deletion from their settings.</p></div></div>
        </aside>
      </div>
    </>
  );
}
