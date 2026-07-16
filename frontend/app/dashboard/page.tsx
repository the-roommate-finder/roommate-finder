"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { getStoredUser, clearSession } from "@/lib/auth/session";
import { logout } from "@/lib/api/auth";

/**
 * Placeholder landing spot after login/signup. The real dashboard (listings,
 * matches, chat, etc.) is out of scope for the auth flow — this just proves
 * the redirect + stored session work end to end.
 */
export default function DashboardPage() {
  const router = useRouter();
  const user = getStoredUser();

  React.useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // ignore — we clear local session regardless
    }
    clearSession();
    router.push("/login");
  }

  if (!user) return null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-secondary/40 px-4 text-center">
      <Logo />
      <div>
        <h1 className="text-2xl font-bold text-brand-ink">
          Welcome, {user.display_name ?? user.email}
        </h1>
        <p className="mt-2 text-muted-foreground">
          This is a placeholder dashboard — build out listings, matches, and
          chat here.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/">
          <Button variant="outline">Back to home</Button>
        </Link>
        <Button variant="solid" onClick={handleLogout}>
          Log out
        </Button>
      </div>
    </main>
  );
}
