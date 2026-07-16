import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";

export default function ResetPasswordSuccessPage() {
  return (
    <AuthShell variant="plain" maxWidth="max-w-xl">
      <p className="text-xl font-medium text-brand-ink sm:text-2xl">
        Your password has been reset successfully. You can now login with your
        new password
      </p>

      <Link
        href="/login"
        className="mt-10 inline-flex items-center gap-2 text-brand-blue underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to log in
      </Link>
    </AuthShell>
  );
}
