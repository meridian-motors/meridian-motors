import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/site/auth-forms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-[26px] font-semibold">Reset your password</h1>
      <p className="mb-8 mt-1.5 text-[14px] text-muted">Enter your email and we&apos;ll send you a secure link.</p>
      <ForgotPasswordForm />
    </>
  );
}
