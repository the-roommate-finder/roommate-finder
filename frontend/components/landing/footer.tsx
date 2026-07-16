import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

const FOOTER_COLUMNS = [
  {
    heading: "Get Started",
    links: ["Create Profile", "Find Roommates", "Browse Properties", "List a Room"],
  },
  {
    heading: "Support",
    links: ["Help Center", "Contact Us", "Privacy Policy", "Terms of Service"],
  },
];

export function Footer() {
  return (
    <>
      <section className="bg-brand-blue py-16 text-center">
        <div className="container">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            Your uncle&apos;s parlor is full.{" "}
            <span className="text-brand-yellow">We have space.</span>
          </h2>
          <p className="mt-3 text-white/80">
            Use Roommate Finder to find someone who won&apos;t eat your rice.
          </p>
          <Link href="/role-selection" className="mt-6 inline-block">
            <Button variant="solid" size="lg" className="bg-white text-brand-blue hover:bg-white/90">
              Start Your Journey Today
            </Button>
          </Link>
        </div>
      </section>

      <footer className="bg-brand-ink py-12 text-white/70">
        <div className="container grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <Logo className="h-9 w-9" />
              <span className="font-bold text-white">Roommate Finder</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm">
              Connecting Nigeria&apos;s room seekers and listers, with
              verified IDs and zero agent drama.
            </p>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading}>
              <p className="font-semibold text-white">{col.heading}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {col.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="hover:text-white">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="container mt-10 border-t border-white/10 pt-6 text-xs">
          © {new Date().getFullYear()} Roommate Finder. All rights reserved.
        </div>
      </footer>
    </>
  );
}
