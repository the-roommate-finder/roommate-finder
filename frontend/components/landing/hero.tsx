import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="bg-brand-ink pb-24 pt-16">
      <div className="container grid items-center gap-12 lg:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-brand-yellow">
            <Sparkles className="h-3.5 w-3.5" />
            Connect, Match, Live Together
          </span>

          <h1 className="mt-6 text-4xl font-extrabold leading-tight text-white sm:text-5xl">
            Your next roommate <br className="hidden sm:block" />
            <span className="text-brand-yellow">won&apos;t be a nightmare.</span>
          </h1>

          <p className="mt-6 max-w-md text-lg text-white/70">
            The platform for room seekers and listers in Nigeria. Match
            compatible flatmates or find vetted tenants. Identity-verified.
            Zero agents. Zero scams.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/role-selection">
              <Button variant="primary" size="lg">
                Get Started
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="outline" size="lg" className="bg-transparent text-white">
                How it works
              </Button>
            </a>
          </div>
        </div>

        <div className="relative mx-auto flex h-72 w-full max-w-md items-center justify-center sm:h-96">
          <div className="absolute right-6 top-2 rotate-3 rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-2 rounded-lg bg-brand-blue px-3 py-1 text-center text-xs font-bold text-white">
              MATCHED
            </div>
            <div className="text-center text-2xl font-extrabold text-brand-blue">98%</div>
            <div className="text-center text-[10px] text-muted-foreground">
              Compatibility Score
            </div>
          </div>
          <div className="absolute bottom-4 left-2 -rotate-2 overflow-hidden rounded-2xl border-4 border-white shadow-2xl">
            <div className="flex h-40 w-56 items-end bg-gradient-to-br from-blue-400 to-brand-blue p-3">
              <span className="rounded-md bg-white/90 px-2 py-1 text-xs font-semibold text-brand-ink">
                3 Bedroom Flat
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
