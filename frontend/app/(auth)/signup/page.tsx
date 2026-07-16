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
import { register } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { classifyIdentifier, validatePassword } from "@/lib/validation";
import { setPendingSignup, getPendingRole } from "@/lib/auth/pending-signup";
import type { UserRole } from "@/lib/api/types";

const ROLE_COPY: Record<UserRole, string> = {
  lister: "Creating account as a Lister",
  seeker: "Creating account as a Room Seeker/Roommate Finder",
  admin: "Creating account",
};

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = (searchParams.get("role") as UserRole) || getPendingRole() || "seeker";

  const [fullName, setFullName] = React.useState("");
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!fullName.trim()) nextErrors.fullName = "Full name is required.";

    const kind = classifyIdentifier(identifier);
    if (kind === "invalid") {
      nextErrors.identifier = "Enter a valid email address or phone number.";
    }

    const passwordError = validatePassword(password);
    if (passwordError) nextErrors.password = passwordError;

    if (confirmPassword !== password) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const isEmailSignup = kind === "email";

      // NOTE: display_name / phone_number / role are not accepted by
      // /auth/register yet — see lib/api/types.ts. They're sent here so the
      // request is already correct once the backend adds those fields.
      await register({
        email: isEmailSignup ? identifier.trim().toLowerCase() : `${identifier.trim()}@placeholder.local`,
        password,
        display_name: fullName.trim(),
        phone_number: isEmailSignup ? undefined : identifier.trim(),
        role,
      });

      setPendingSignup({
        role,
        display_name: fullName.trim(),
        email: isEmailSignup ? identifier.trim().toLowerCase() : undefined,
        phone_number: isEmailSignup ? undefined : identifier.trim(),
      });

      router.push(
        isEmailSignup
          ? `/verify-email?email=${encodeURIComponent(identifier.trim().toLowerCase())}`
          : `/verify-phone?phone=${encodeURIComponent(identifier.trim())}`
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors({ form: err.message });
      } else {
        setErrors({ form: "Something went wrong. Please try again." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <Logo className="mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-brand-ink">Create Your Account</h1>
        <p className="mt-2 text-sm text-muted-foreground">{ROLE_COPY[role]}</p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div>
          <Label htmlFor="fullName">Full Name</Label>
          <Input
            id="fullName"
            placeholder="Dan Jimoh"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            error={!!errors.fullName}
          />
          {errors.fullName && (
            <p className="mt-1 text-sm text-brand-error">{errors.fullName}</p>
          )}
        </div>

        <div>
          <Label htmlFor="identifier">Email Address/Phone Number</Label>
          <Input
            id="identifier"
            placeholder="Hero Daniel@gmail.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            error={!!errors.identifier}
          />
          {errors.identifier && (
            <p className="mt-1 text-sm text-brand-error">{errors.identifier}</p>
          )}
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <PasswordField
            id="password"
            placeholder="Min 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={!!errors.password}
          />
          {errors.password && (
            <p className="mt-1 text-sm text-brand-error">{errors.password}</p>
          )}
        </div>

        <div>
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <PasswordField
            id="confirmPassword"
            placeholder="********"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={!!errors.confirmPassword}
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-sm text-brand-error">{errors.confirmPassword}</p>
          )}
        </div>

        {errors.form && (
          <p className="rounded-lg bg-brand-error/10 p-3 text-sm text-brand-error">
            {errors.form}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={submitting}>
          Create account
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-blue underline">
            Login
          </Link>
        </p>

        <div className="relative py-2 text-center text-sm text-muted-foreground">
          <span className="relative bg-white px-3">Or</span>
          <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-border" />
        </div>

        <GoogleButton />

        <p className="pt-2 text-center text-xs text-muted-foreground">
          By signing up, you agree to Roommate Finder&apos;s Terms of service and
          privacy policy
        </p>
      </form>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
