import { cn } from "@/lib/utils";

const STRIP_ITEMS = Array.from({ length: 9 });

export function VerifiedStrip({ reverse = false }: { reverse?: boolean }) {
  return (
    <div className="overflow-hidden bg-brand-blue py-3">
      <div
        className={cn(
          "flex w-max motion-reduce:animate-none",
          reverse ? "animate-marquee-reverse" : "animate-marquee"
        )}
      >
        {[...STRIP_ITEMS, ...STRIP_ITEMS].map((_, i) => (
          <span
            key={i}
            className="mr-10 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-white/90"
          >
            Verified ID
          </span>
        ))}
      </div>
    </div>
  );
}