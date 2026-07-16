"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { Logo } from "@/components/logo";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/password-field";
import { resetPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { validatePassword } from "@/lib/validation";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!token) {
      nextErrors.form = "This reset link is invalid or has expired. Request a new one.";
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) nextErrors.newPassword = passwordError;

    if (confirmPassword !== newPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await resetPassword({ token, new_password: newPassword });
      router.push("/reset-password/success");
    } catch (err) {
      setErrors({
        form:
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
      });
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
          Create a new password for your account. Choose a password
          that&apos;s easy for you to remember and hard for other to guess.
        </p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div>
          <Label htmlFor="newPassword">New Password</Label>
          <PasswordField
            id="newPassword"
            placeholder="Min 8 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={!!errors.newPassword}
          />
          {errors.newPassword && (
            <p className="mt-1 text-sm text-brand-error">{errors.newPassword}</p>
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
          Reset Password
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
