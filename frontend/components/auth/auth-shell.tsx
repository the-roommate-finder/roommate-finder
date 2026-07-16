import { cn } from "@/lib/utils";

interface AuthShellProps {
  children: React.ReactNode;
  variant?: "card" | "plain";
  maxWidth?: string;
}

export function AuthShell({ children, variant = "card", maxWidth = "max-w-md" }: AuthShellProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-auth-gradient px-4 py-12">
      <div
        className={cn(
          "w-full animate-fade-in",
          maxWidth,
          variant === "card" && "rounded-2xl bg-white p-8 shadow-xl sm:p-10",
          variant === "plain" && "text-center"
        )}
      >
        {children}
      </div>
    </main>
  );
}
