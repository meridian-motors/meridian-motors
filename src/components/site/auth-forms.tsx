"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { signIn, signUp, requestPasswordReset, updatePassword } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";

type S = ActionResult | null;
const errs = (s: S) => (s && !s.ok ? s.fieldErrors ?? {} : {});

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState<S, FormData>(signIn, null);
  const fe = errs(state);
  return (
    <form action={action} className="space-y-4" noValidate>
      {notice ? <Alert tone="warning">{notice}</Alert> : null}
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <Field label="Email" htmlFor="email" error={fe.email}><Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fe.email} /></Field>
      <Field label="Password" htmlFor="password" error={fe.password}><Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={!!fe.password} /></Field>
      <div className="flex justify-end"><Link href="/forgot-password" className="text-[13px] text-muted hover:text-ink">Forgotten your password?</Link></div>
      {state && !state.ok ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null}Sign in</Button>
      <p className="text-center text-[13.5px] text-muted">New to Meridian Motors? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-ink underline-offset-4 hover:underline">Create an account</Link></p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState<S, FormData>(signUp, null);
  const fe = errs(state);
  if (state?.ok) return <div className="text-center"><MailCheck className="mx-auto size-10 text-accent" strokeWidth={1.25} /><h2 className="mt-4 text-xl font-semibold">Verify your email</h2><p className="mt-2 text-[14px] text-muted">{state.message}</p></div>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" htmlFor="firstName" error={fe.firstName}><Input id="firstName" name="firstName" autoComplete="given-name" aria-invalid={!!fe.firstName} /></Field>
        <Field label="Last name" htmlFor="lastName" error={fe.lastName}><Input id="lastName" name="lastName" autoComplete="family-name" aria-invalid={!!fe.lastName} /></Field>
      </div>
      <Field label="Email" htmlFor="email" error={fe.email}><Input id="email" name="email" type="email" autoComplete="email" aria-invalid={!!fe.email} /></Field>
      <Field label="Password" htmlFor="password" error={fe.password} hint="At least 10 characters, including a letter and a number.">
        <Input id="password" name="password" type="password" autoComplete="new-password" aria-invalid={!!fe.password} />
      </Field>
      <div className="space-y-3 pt-1">
        <Checkbox name="terms" label={<>I agree to the <Link href="/terms" className="underline">terms</Link> and have read the <Link href="/privacy" className="underline">privacy policy</Link>.</>} />
        {fe.terms ? <p className="text-[12.5px] text-danger">{fe.terms}</p> : null}
        <Checkbox name="marketing" label="Send me occasional news and offers from Meridian Motors" description="Optional. You can unsubscribe at any time." />
      </div>
      {state && !state.ok ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null}Create account</Button>
      <p className="text-center text-[13.5px] text-muted">Already have an account? <Link href="/login" className="font-medium text-ink underline-offset-4 hover:underline">Sign in</Link></p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<S, FormData>(requestPasswordReset, null);
  const fe = errs(state);
  if (state?.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="email" error={fe.email}><Input id="email" name="email" type="email" autoComplete="email" aria-invalid={!!fe.email} /></Field>
      {state && !state.ok && !fe.email ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null}Send reset link</Button>
      <p className="text-center text-[13.5px] text-muted"><Link href="/login" className="hover:text-ink">Back to sign in</Link></p>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<S, FormData>(updatePassword, null);
  const fe = errs(state);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="New password" htmlFor="password" error={fe.password} hint="At least 10 characters, including a letter and a number."><Input id="password" name="password" type="password" autoComplete="new-password" /></Field>
      <Field label="Confirm new password" htmlFor="confirm" error={fe.confirm}><Input id="confirm" name="confirm" type="password" autoComplete="new-password" /></Field>
      {state && !state.ok && !fe.password && !fe.confirm ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>Update password</Button>
    </form>
  );
}
