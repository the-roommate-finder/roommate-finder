import { Users, Building2 } from "lucide-react";

function EmptyState({
  icon: Icon,
  message,
}: {
  icon: typeof Users;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white/60 px-6 py-16 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-brand-blue">
        <Icon className="h-6 w-6" />
      </span>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function ListingsPreview() {
  return (
    <section id="browse" className="bg-secondary/50 py-20">
      <div className="container space-y-16">
        <div>
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-extrabold text-brand-ink">Latest roommates</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                People looking for roommates or teaming up to rent in Nigeria
              </p>
            </div>
          </div>

          <div className="mt-6">
            <EmptyState
              icon={Users}
              message="Roommate profiles will appear here once people start signing up."
            />
          </div>
        </div>

        <div>
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-extrabold text-brand-ink">Latest rooms</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Freshly listed rooms across Nigeria
              </p>
            </div>
          </div>

          <div className="mt-6">
            <EmptyState
              icon={Building2}
              message="New listings will show up here as soon as listers publish them."
            />
          </div>
        </div>
      </div>
    </section>
  );
}