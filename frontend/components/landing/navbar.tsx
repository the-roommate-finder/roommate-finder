import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "About", href: "#about" },
  { label: "Pricing", href: "#pricing" },
  { label: "Browse", href: "#browse" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-brand-ink/95 backdrop-blur">
      <div className="container flex h-20 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Logo className="h-9 w-9" />
          <span className="text-lg font-bold text-white">Roommate Finder</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-white/70 transition hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm font-medium text-white/80 hover:text-white sm:block"
          >
            Login
          </Link>
          <Link href="/role-selection">
            <Button variant="primary" size="sm">
              Get Started
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
