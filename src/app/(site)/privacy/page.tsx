import type { Metadata } from "next";
import { LegalDocument } from "@/components/site/content";

export const metadata: Metadata = { title: "Privacy policy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <LegalDocument title="Privacy policy" updated="2026-11 (draft)">
      <p>This notice explains how Meridian Motors (&ldquo;we&rdquo;) collects and uses personal data when you use our marketplace and vehicle sales services, in line with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.</p>
      <h2>Who we are</h2>
      <p>Meridian Motors is the controller of your personal data. [LEGAL REVIEW: registered company name, number, registered address, ICO registration number and data protection contact.]</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> name, email address, phone number (optional), password (stored securely by our authentication provider), and your preferences.</li>
        <li><strong>Seller data:</strong> vehicle details including registration number and VIN, condition and history disclosures, photographs, supporting documents (for example a V5C), your location and your pricing instructions.</li>
        <li><strong>Buyer data:</strong> saved vehicles and searches, vehicle preferences you choose to give us, and enquiries and messages.</li>
        <li><strong>Transaction data:</strong> sale records and payments of Meridian fees (card details are processed by Stripe and are not stored by us).</li>
        <li><strong>Technical data:</strong> a hashed form of your IP address used for security, rate limiting and counting listing views; cookies as described in our cookie policy.</li>
      </ul>
      <h2>How and why we use it (lawful bases)</h2>
      <ul>
        <li>To provide the marketplace and brokerage services you request — <em>contract</em>.</li>
        <li>To prevent fraud, secure the platform and verify listings — <em>legitimate interests</em>.</li>
        <li>To keep financial and transaction records — <em>legal obligation</em>.</li>
        <li>To send marketing emails and to use analytics cookies — <em>consent</em>, which you can withdraw at any time.</li>
        <li>To recommend vehicles based on preferences you have given us, when you opt in — <em>consent</em>.</li>
      </ul>
      <h2>Automated processing and AI</h2>
      <p>We use automated tools, including AI services provided by Anthropic (Claude), to help interpret search requests, draft listing descriptions from confirmed vehicle facts, review submissions for missing or inconsistent information, and triage enquiries. These tools do not make decisions with legal or similarly significant effects about you: valuations are indicative, listings require human approval, and staff make all approval decisions. Buyer matching uses only the vehicle preferences you give us and never sensitive characteristics. We send AI providers only the data needed for the task and never send your contact details. [LEGAL REVIEW: international transfer safeguards for AI and hosting providers.]</p>
      <h2>Who we share data with</h2>
      <p>We share data with service providers who process it on our behalf: Supabase (database, authentication and storage), Vercel (hosting), Stripe (payments), Resend (email), Anthropic (AI processing), Sentry (error monitoring), and the DVLA Vehicle Enquiry Service (registration lookups). Public listings show vehicle information only — never your name, contact details, address, registration number or VIN. When a buyer enquires, sellers see the buyer&apos;s first name and message; Meridian coordinates contact.</p>
      <h2>How long we keep data</h2>
      <p>Account data is kept while your account is open. Completed transaction and payment records are retained for six years for accounting and legal purposes. Audit logs are retained to protect the integrity of the platform. Enquiries relating to vehicles that did not sell are deleted or anonymised after 24 months. [LEGAL REVIEW: retention schedule.]</p>
      <h2>Your rights</h2>
      <p>You have the right to access, correct, erase, restrict or object to processing of your personal data, and to data portability. You can request account deletion from your settings, or contact us using the &ldquo;Data protection&rdquo; topic on our contact page. We respond within one month. You can also complain to the Information Commissioner&apos;s Office (ico.org.uk).</p>
    </LegalDocument>
  );
}
