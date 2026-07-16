import Link from "next/link";
import { Users, Home, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PathPicker() {
  return (
    <section className="py-20">
      <div className="container">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-brand-blue">
            What brings you here?
          </p>
          <h2 className="mt-2 text-3xl font-extrabold text-brand-ink sm:text-4xl">
            Pick your Path, We&apos;ll do the rest
          </h2>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border p-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-blue text-white">
              <Users className="h-6 w-6" />
            </span>
            <h3 className="mt-5 text-xl font-bold text-brand-ink">
              Looking for a Room?
            </h3>
            <p className="mt-2 text-muted-foreground">
              Browse thousands of verified rooms and apartments. Find the
              perfect space that fits your budget.
            </p>
            <Link href="/role-selection?intent=seeker" className="mt-5 inline-block">
              <Button variant="solid">
                Find Rooms/Roommate
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="rounded-2xl border border-border p-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-blue text-white">
              <Home className="h-6 w-6" />
            </span>
            <h3 className="mt-5 text-xl font-bold text-brand-ink">
              Have a Room to Share?
            </h3>
            <p className="mt-2 text-muted-foreground">
              Post your listing for free and find compatible roommates. Split
              costs and enjoy shared living.
            </p>
            <Link href="/role-selection?intent=lister" className="mt-5 inline-block">
              <Button variant="solid">
                List your space
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
