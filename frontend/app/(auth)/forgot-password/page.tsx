"use client";

import * as React from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Logo } from "@/components/logo";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { forgotPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { isEmail } from "@/lib/validation";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await forgotPassword({ email: email.trim().toLowerCase() });
      setSent(true);
    } catch (err) {
      // Intentionally shown even on failure paths where the backend hides
      // whether the email exists — but ApiError still carries real issues
      // like rate limiting, so surface those.
      if (err instanceof ApiError && err.status !== 404) {
        setError(err.message);
      } else {
        setSent(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-8 text-center">
        <Logo className="mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-brand-ink">Password Reset</h1>
        <p className="mt-3 text-muted-foreground">
          Enter the email associated with your Roommate Finder account and
          we&apos;ll send you a link to create a new one.
        </p>
      </div>

      {sent ? (
        <div className="space-y-6 text-center">
          <p className="rounded-lg bg-brand-success/10 p-4 text-sm text-brand-success">
            If an account exists for {email}, a reset link is on its way.
          </p>
          <Link href="/login" className="font-medium text-brand-blue underline">
            Back to log in
          </Link>
        </div>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit} noValidate>
          <div>
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={!!error}
            />
            {error && <p className="mt-1 text-sm text-brand-error">{error}</p>}
          </div>

          <Button type="submit" variant="primary" size="lg" className="w-full" loading={submitting}>
            Request
          </Button>

          <p className="text-center">
            <Link href="/login" className="text-sm font-medium text-brand-blue underline">
              Back to log in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
