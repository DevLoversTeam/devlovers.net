import type { ReactNode } from 'react';

export function CheckoutPageShell({
  'aria-labelledby': labelledBy,
  children,
}: {
  'aria-labelledby'?: string;
  children: ReactNode;
}) {
  return (
    <main
      className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8"
      aria-labelledby={labelledBy}
    >
      {children}
    </main>
  );
}

interface CheckoutNoticeProps {
  title: ReactNode;
  titleId?: string;
  description?: ReactNode;
  children?: ReactNode;
}

export function CheckoutNoticePage({
  title,
  titleId,
  description,
  children,
}: CheckoutNoticeProps) {
  return (
    <CheckoutPageShell aria-labelledby={titleId}>
      <section className="border-border bg-card rounded-lg border p-8 text-center">
        <h1 id={titleId} className="text-foreground text-2xl font-bold">
          {title}
        </h1>

        {description ? (
          <p className="text-muted-foreground mt-2 text-sm">{description}</p>
        ) : null}

        {children}
      </section>
    </CheckoutPageShell>
  );
}
