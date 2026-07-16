import { ShieldCheck } from "lucide-react";

export function VerifiedStrip() {
  const items = Array.from({ length: 9 });
  return (
    <div className="overflow-hidden bg-brand-blue py-3">
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2 px-4">
        {items.map((_, i) => (
          <span
            key={i}
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-white/90"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-brand-yellow" />
            Verified ID
          </span>
        ))}
      </div>
    </div>
  );
}
