import type { Metadata } from "next";
import { LegalDocument } from "@/components/site/content";
import { CookieSettingsButton } from "@/components/site/cookie-settings-button";

export const metadata: Metadata = { title: "Cookie policy", alternates: { canonical: "/cookies" } };

export default function CookiesPage() {
  return (
    <LegalDocument title="Cookie policy" updated="2026-11 (draft)">
      <p>We use a small number of cookies. Strictly necessary cookies are always active because the site cannot work without them. Optional cookies are only set with your consent, under the Privacy and Electronic Communications Regulations (PECR).</p>
      <h2>Strictly necessary</h2>
      <ul>
        <li><strong>sb-*-auth-token</strong> — keeps you signed in securely (Supabase). Session / up to 1 week.</li>
        <li><strong>mm_consent</strong> — remembers your cookie choices. 6 months.</li>
      </ul>
      <h2>Analytics (optional)</h2>
      <p>No analytics cookies are currently set. If analytics are introduced they will only run when you have accepted analytics cookies, and this policy will list them. Listing view counts use a daily, non-reversible hash and do not set a cookie.</p>
      <h2>Changing your choice</h2>
      <p>You can change your cookie preferences at any time.</p>
      <CookieSettingsButton />
    </LegalDocument>
  );
}
