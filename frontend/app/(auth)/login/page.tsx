"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { Logo } from "@/components/logo";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/password-field";
import { GoogleButton } from "@/components/auth/google-button";
import { login } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { classifyIdentifier } from "@/lib/validation";
import { saveSession } from "@/lib/auth/session";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justVerified = searchParams.get("verified") === "1";

  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const kind = classifyIdentifier(identifier);
    if (kind === "invalid") {
      setError("Enter a valid email address or phone number.");
      return;
    }
    if (kind === "phone") {
      // EXPECTED: /auth/login only accepts `email` today. Once phone login
      // is added server-side, drop this guard.
      setError("Login with phone number isn't available yet — please use your email.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await login({ email: identifier.trim().toLowerCase(), password });
      saveSession(result);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <Logo className="mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-brand-ink">Welcome back!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Login to your dashboard to find roommates, explore shared apartments
          and manage your listing with ease.
        </p>
      </div>

      {justVerified && (
        <p className="mb-4 rounded-lg bg-brand-success/10 p-3 text-center text-sm text-brand-success">
          Your account is verified. You can log in now.
        </p>
      )}

      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div>
          <Label htmlFor="identifier">Email address/Phone number</Label>
          <Input
            id="identifier"
            placeholder="Hero Daniel@gmail.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <PasswordField
            id="password"
            placeholder="********"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="mt-2 text-right">
            <Link href="/forgot-password" className="text-sm font-semibold text-brand-error">
              Forgot Password?
            </Link>
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-brand-error/10 p-3 text-sm text-brand-error">{error}</p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={submitting}>
          Login
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/role-selection" className="font-medium text-brand-blue underline">
            Create an account
          </Link>
        </p>

        <div className="relative py-2 text-center text-sm text-muted-foreground">
          <span className="relative bg-white px-3">Or</span>
          <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-border" />
        </div>

        <GoogleButton />
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
