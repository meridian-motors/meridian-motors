import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/site/auth-forms";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage() {
  if (!(await getSession())) redirect("/forgot-password");
  return (
    <>
      <h1 className="text-[26px] font-semibold">Choose a new password</h1>
      <p className="mb-8 mt-1.5 text-[14px] text-muted">You&apos;ll stay signed in after updating it.</p>
      <ResetPasswordForm />
    </>
  );
}
