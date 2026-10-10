import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  actions,
}: {
  kicker?: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-border pb-4 sm:mb-8">
      <div className="min-w-0">
        {kicker && (
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            {kicker}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
