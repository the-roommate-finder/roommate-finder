import { Fingerprint, Wallet } from "lucide-react";
import Image from "next/image";


const VIBE_TAGS = ["Sleep Schedule", "Pets", "Cleanliness", "Guests", "Noise Level", "Prayer Habits", "Lifestyle", "Budget", "Hobbies"];

export function Features() {
  return (
    <section id="how-it-works" className="bg-secondary/50 py-20">
      <div className="container">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-brand-blue">
            What We Built
          </p>
          <h2 className="mt-2 text-3xl font-extrabold text-brand-ink sm:text-4xl">
            Built By People With Terrible Ex-Flatmates
          </h2>
          <p className="mt-3 text-muted-foreground">
            Every feature exists because someone, somewhere, had a terrible flatmate.
          </p>
        </div>

        <div className="mt-12 grid gap-6 rounded-2xl bg-brand-blue/5 p-8 lg:grid-cols-2 lg:items-center">
          <div>
            <h3 className="text-2xl font-bold text-brand-ink">
              The Truth About Their Living Habits.
            </h3>
            <p className="mt-3 text-muted-foreground">
              Their side had a different testimony. We match you on lifestyle
              traits, sleep schedules, noise tolerance, cleanliness, even
              prayer habits, so you know exactly who&apos;s moving in with you.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {VIBE_TAGS.map((tag) => (
                <span
                  key={tag}
                  className="rounded-sm bg-brand-blue px-4 py-1.5 text-xs font-sans text-white"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <Image
            src="/landinpagebuilding.jpg"
            alt="Features Image"
            width={600}
            height={600}
            className="h-full w-full object-cover"
          />
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <div className="mb-6 flex h-40 items-center justify-center rounded-xl bg-secondary">
              <Fingerprint className="h-16 w-16 text-brand-blue" />
            </div>
            <h3 className="text-xl font-bold text-brand-ink">ID Verification</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Instead of hunting every day, our app looks for roommates for you
              in the background. The second someone matches your exact habits,
              budget, and vibe, your phone instantly buzzes.
            </p>
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <div className="mb-6 flex h-40 items-center justify-center rounded-xl bg-secondary">
              <Wallet className="h-16 w-16 text-brand-blue" />
            </div>
            <h3 className="text-xl font-bold text-brand-ink">
              I Thought You Had The Rent Covered.
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Instead of hunting every day, our app looks for roommates for you
              in the background. The second someone matches your exact budget
              and vibe, your phone instantly buzzes.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
