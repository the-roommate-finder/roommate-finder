import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Seekers",
    price: "NGN0/month",
    featured: false,
    features: ["Create profile", "Browse roommate profiles", "Browse shared apartments", "Save listings"],
    cta: "Get Started Free",
  },
  {
    name: "Premium Seekers",
    price: "NGN5000/month",
    featured: true,
    features: ["Unlimited messaging", "Advanced room filters", "Compatibility score", "Priority profile visibility"],
    cta: "Upgrade to premium",
  },
  {
    name: "Listers",
    price: "NGN0/month",
    featured: false,
    features: ["Create account", "Publish 1-3 listings", "Receive inquiries", "Manage messages"],
    cta: "Start Listing",
  },
  {
    name: "Premium Listers",
    price: "NGN10,000/month",
    featured: true,
    features: ["More active listings", "Featured placements", "Listing analytics", "Priority support"],
    cta: "Choose Pro",
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="bg-secondary/50 py-20">
      <div className="container">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-brand-blue">
            Simple, transparent pricing
          </p>
          <h2 className="mt-2 text-3xl font-extrabold text-brand-ink sm:text-4xl">
            Choose The Plan That Fits Your Housing Needs
          </h2>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "flex flex-col rounded-2xl border bg-white p-6",
                plan.featured ? "border-brand-blue shadow-md" : "border-border"
              )}
            >
              {plan.featured && (
                <span className="mb-3 inline-block w-fit rounded-full bg-brand-yellow px-3 py-1 text-xs font-bold text-brand-ink">
                  Popular
                </span>
              )}
              <h3 className="font-bold text-brand-ink">{plan.name}</h3>
              <p className="mt-1 text-2xl font-extrabold text-brand-blue">{plan.price}</p>

              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-success" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link href="/role-selection" className="mt-6">
                <Button variant={plan.featured ? "solid" : "outline"} className="w-full">
                  {plan.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
