import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 56"
      className={cn("h-14 w-14", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* roof */}
      <path d="M32 4L58 22" stroke="#1D4ED8" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 4L6 22" stroke="#1D4ED8" strokeWidth="4" strokeLinecap="round" />

      {/* gold arc beneath the people, echoing the "table" in the source mark */}
      <path
        d="M14 40C14 40 22 46 32 46C42 46 50 40 50 40"
        stroke="#FACC15"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* left person */}
      <circle cx="15" cy="28" r="5" fill="#2563EB" />
      <path
        d="M7 44C7 38.4772 10.5817 34 15 34C19.4183 34 23 38.4772 23 44"
        fill="#2563EB"
      />

      {/* right person */}
      <circle cx="49" cy="28" r="5" fill="#2563EB" />
      <path
        d="M41 44C41 38.4772 44.5817 34 49 34C53.4183 34 57 38.4772 57 44"
        fill="#2563EB"
      />

      {/* center person (taller, drawn last so it sits on top) */}
      <circle cx="32" cy="24" r="6" fill="#1D4ED8" />
      <path
        d="M22 42C22 34.8203 26.4772 29 32 29C37.5228 29 42 34.8203 42 42"
        fill="#1D4ED8"
      />
    </svg>
  );
}
