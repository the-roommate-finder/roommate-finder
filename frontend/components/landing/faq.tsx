"use client";

import * as React from "react";
import { Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";

const FAQS = [
  {
    q: "How do you help me find a roommate who actually matches how I live?",
    a: "We go beyond a photo and a price tag. You'll answer questions about your sleep schedule, cleanliness, noise tolerance, and guest habits, and we surface matches ranked by compatibility score.",
  },
  {
    q: "Do I need a subscription to find roommates?",
    a: "No. Browsing profiles, saving listings, and messaging on the free Seekers plan is enough for most people. Premium unlocks unlimited messaging and priority visibility.",
  },
  {
    q: "Is Roommate Finder free?",
    a: "Creating a profile and browsing is free for both seekers and listers. Premium plans add extra visibility and unlimited messaging.",
  },
  {
    q: "How do you verify listers and their properties?",
    a: "Every lister goes through an ID verification step before their listing goes live, so you're never negotiating with an anonymous account.",
  },
];

export function Faq() {
  const [open, setOpen] = React.useState<number | null>(0);

  return (
    <section className="py-20">
      <div className="container max-w-3xl">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-brand-ink sm:text-4xl">
            You&apos;ve got questions.
          </h2>
          <p className="mt-2 text-muted-foreground">
            We&apos;ve probably heard them before.
          </p>
        </div>

        <div className="mt-10 divide-y divide-border rounded-2xl border border-border bg-white">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="font-semibold text-brand-ink">{item.q}</span>
                  {isOpen ? (
                    <Minus className="h-5 w-5 shrink-0 text-brand-blue" />
                  ) : (
                    <Plus className="h-5 w-5 shrink-0 text-brand-blue" />
                  )}
                </button>
                {isOpen && (
                  <p className="px-6 pb-5 text-sm text-muted-foreground">{item.a}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-10 rounded-2xl bg-secondary/70 p-8 text-center">
          <p className="font-semibold text-brand-ink">Still confused?</p>
          <p className="text-sm text-muted-foreground">
            Slide into our inbox. We don&apos;t bite.
          </p>
          <a href="mailto:hello@roommatefinder.ng" className="mt-4 inline-block">
            <Button variant="solid">Send us a message</Button>
          </a>
        </div>
      </div>
    </section>
  );
}
