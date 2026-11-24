import type { Metadata } from "next";
import { LegalDocument } from "@/components/site/content";

export const metadata: Metadata = { title: "Terms and conditions", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <LegalDocument title="Terms and conditions" updated="2026-11 (draft)">
      <h2>1. About these terms</h2>
      <p>These terms apply to your use of the Meridian Motors website and services. [LEGAL REVIEW: full company details; separate seller brokerage agreement; consumer contract regulations including cancellation rights for paid services.]</p>
      <h2>2. Our role</h2>
      <p>Meridian Motors provides an online marketplace and a private vehicle sales brokerage service. Unless a separate written agreement states otherwise, Meridian Motors does not buy, own, take possession of or sell the vehicles listed. The contract for the sale of a vehicle is made directly between the buyer and the seller. [LEGAL REVIEW: whether Meridian acts as agent for the seller, and the resulting duties; the application of consumer law to brokered sales.]</p>
      <h2>3. Sellers</h2>
      <ul>
        <li>You must be the registered keeper or otherwise legally entitled to sell the vehicle.</li>
        <li>You must describe the vehicle accurately and disclose known damage, faults, accident history, modifications and outstanding finance. Misdescription may give the buyer a claim against you.</li>
        <li>You must tell us if you are selling in the course of a business. Traders must not present themselves as private sellers.</li>
        <li>You approve your asking price and set a minimum authorised price. Meridian will not change your asking price without your authorisation and never below your minimum.</li>
        <li>Valuations and recommended prices are indicative estimates, not guarantees of sale price or timescale.</li>
      </ul>
      <h2>4. Fees</h2>
      <p>No fee is charged to submit or list a vehicle. A success fee becomes payable when a sale is completed — meaning the seller and Meridian have both confirmed that the vehicle has been handed over to the buyer following an agreed sale arranged through Meridian Motors. The fee is calculated from the final agreed sale price using the fee table published at the time your listing was approved. Optional services are charged at the price shown when ordered. [LEGAL REVIEW: sales completed privately with buyers introduced by Meridian; refunds; late payment.]</p>
      <h2>5. Buyers</h2>
      <p>Listings are prepared from information supplied by sellers and reviewed by Meridian. Unless a listing states that a specific check has been completed, information has not been independently verified. You should inspect the vehicle and its documents and consider an independent history check and inspection before buying. Never transfer money for a vehicle before you have seen it and its documents. Meridian Motors will never ask you to pay us for a vehicle.</p>
      <h2>6. Acceptable use</h2>
      <p>You must not misuse the platform, submit false information, scrape content, attempt to circumvent security, or use contact information for any purpose other than the transaction concerned.</p>
      <h2>7. Liability</h2>
      <p>[LEGAL REVIEW: limitation of liability consistent with the Consumer Rights Act 2015; nothing limits liability for death or personal injury caused by negligence, or for fraud.]</p>
      <h2>8. Complaints and disputes</h2>
      <p>Contact us using the &ldquo;Complaint&rdquo; topic on our contact page. [LEGAL REVIEW: complaints handling procedure, ADR provider, governing law (England and Wales) and jurisdiction.]</p>
    </LegalDocument>
  );
}
