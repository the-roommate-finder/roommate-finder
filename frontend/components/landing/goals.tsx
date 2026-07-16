import { ShieldCheck, Zap, MessageSquare } from "lucide-react";

const GOALS = [
  {
    icon: ShieldCheck,
    eyebrow: "Security",
    title: "Trust Rating: 100% ID verified",
    description:
      "All users go through platform-strict background and identity checks. Every listing is trusted.",
  },
  {
    icon: Zap,
    eyebrow: "Speed",
    title: "Quick Listing",
    description:
      "Skip the confusing paperwork and long forms. Upload your property basics and get your first lead in minutes.",
  },
  {
    icon: MessageSquare,
    eyebrow: "Management",
    title: "Direct Communication",
    description:
      "Chat directly with prospective tenants inside a secure dashboard — no costly third-party real estate agent.",
  },
];

export function Goals() {
  return (
    <section className="py-20">
      <div className="container">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-brand-blue">
            What is your living goal?
          </p>
          <h2 className="mt-2 text-3xl font-extrabold text-brand-ink sm:text-4xl">
            Choose Your Direction, We&apos;ll Find Your Match
          </h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {GOALS.map(({ icon: Icon, eyebrow, title, description }) => (
            <div key={eyebrow} className="rounded-2xl border border-border p-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-blue text-white">
                <Icon className="h-6 w-6" />
              </span>
              <p className="mt-5 text-xs font-bold uppercase tracking-wide text-brand-blue">
                {eyebrow}
              </p>
              <h3 className="mt-1 text-lg font-bold text-brand-ink">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
