import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/site/auth-forms";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default async function RegisterPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <>
      <h1 className="text-[26px] font-semibold">Create your account</h1>
      <p className="mb-8 mt-1.5 text-[14px] text-muted">One account for buying and selling.</p>
      <RegisterForm />
    </>
  );
}
