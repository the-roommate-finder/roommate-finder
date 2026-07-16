"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Users, Home } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setPendingRole } from "@/lib/auth/pending-signup";
import type { UserRole } from "@/lib/api/types";

const ROLES: Array<{
  role: UserRole;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    role: "seeker",
    title: "Find a Room or Roommate",
    description: "Discover compatible roommates and shared housing opportunities",
    icon: <Users className="h-5 w-5" />,
  },
  {
    role: "lister",
    title: "List a Property",
    description: "Advertise available rooms and connect with potential tenants",
    icon: <Home className="h-5 w-5" />,
  },
];

export default function RoleSelectionPage() {
  const router = useRouter();
  const [selected, setSelected] = React.useState<UserRole>("lister");

  function handleContinue() {
    setPendingRole(selected);
    router.push(`/signup?role=${selected}`);
  }

  return (
    <AuthShell maxWidth="max-w-lg">
      <div className="mb-8 text-center">
        <Logo className="mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-brand-ink">What brings you here?</h1>
        <p className="mt-2 text-muted-foreground">
          Select your role to access the features that matter most to you.
        </p>
      </div>

      <div className="space-y-4">
        {ROLES.map((option) => {
          const isSelected = selected === option.role;
          return (
            <button
              key={option.role}
              type="button"
              onClick={() => setSelected(option.role)}
              className={cn(
                "flex w-full items-start gap-4 rounded-xl border p-5 text-left transition",
                isSelected
                  ? "border-brand-blue ring-1 ring-brand-blue"
                  : "border-border hover:border-brand-blue/40"
              )}
            >
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-brand-blue">
                {option.icon}
              </span>
              <span>
                <span className="block font-semibold text-brand-ink">{option.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Button variant="solid" size="lg" className="mt-8 w-full" onClick={handleContinue}>
        Continue
      </Button>
    </AuthShell>
  );
}
