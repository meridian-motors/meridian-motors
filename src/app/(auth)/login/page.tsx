import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/site/auth-forms";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  if (await getSession()) redirect(sp.next?.startsWith("/") ? sp.next : "/dashboard");
  return (
    <>
      <h1 className="text-[26px] font-semibold">Sign in</h1>
      <p className="mb-8 mt-1.5 text-[14px] text-muted">Welcome back to Meridian Motors.</p>
      <LoginForm next={sp.next} notice={sp.error === "link" ? "That link has expired or was already used. Please sign in, or request a new link." : undefined} />
    </>
  );
}
