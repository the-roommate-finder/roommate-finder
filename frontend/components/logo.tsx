import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/rmf-logo.png"
      alt="Roommate Finder logo"
      width={60}
      height={60}
      className={cn("h-16 w-16 object-contain", className)}
      priority
    />
  );
}
