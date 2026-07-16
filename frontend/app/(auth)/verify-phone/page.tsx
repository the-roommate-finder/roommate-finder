"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { Logo } from "@/components/logo";
import { OtpInput } from "@/components/otp-input";
import { Button } from "@/components/ui/button";
import { verifyPhoneOtp, sendPhoneOtp } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { getPendingSignup } from "@/lib/auth/pending-signup";

function VerifyPhoneForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone") ?? getPendingSignup()?.phone_number ?? "";

  const [otp, setOtp] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [resent, setResent] = React.useState(false);

  async function handleVerify() {
    if (otp.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await verifyPhoneOtp({ phone_number: phone, otp });
      router.push("/login?verified=1");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid or expired code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      await sendPhoneOtp({ phone_number: phone });
      setResent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't resend the code.");
    } finally {
      setResending(false);
    }
  }

  React.useEffect(() => {
    if (otp.length === 6) handleVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  return (
    <AuthShell variant="plain" maxWidth="max-w-xl">
      <Logo className="mx-auto mb-6" />
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">OTP Confirmation</h1>
      <p className="mx-auto mt-4 max-w-md text-muted-foreground">
        To keep your account secure, we&apos;ve sent a 6 digits verification code to
        your phone number. Enter the code below to continue
      </p>

      <div className="mt-10">
        <OtpInput value={otp} onChange={setOtp} error={!!error} disabled={submitting} />
      </div>

      {error && <p className="mt-4 text-sm text-brand-error">{error}</p>}
      {submitting && <p className="mt-4 text-sm text-muted-foreground">Verifying…</p>}

      <div className="mt-8">
        <Button variant="link" onClick={handleResend} disabled={resending}>
          {resending ? "Resending…" : resent ? "Code resent — Resend again" : "Resend code"}
        </Button>
      </div>
    </AuthShell>
  );
}

export default function VerifyPhonePage() {
  return (
    <Suspense fallback={null}>
      <VerifyPhoneForm />
    </Suspense>
  );
}
