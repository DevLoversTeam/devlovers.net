type Props = {
  id: string;
  title: string;
  children: React.ReactNode;
};

export default function LegalBlock({ id, title, children }: Props) {
  return (
    <section
      id={id}
      className="border-b border-gray-200/60 py-8 last:border-b-0 sm:py-10 dark:border-neutral-800/60"
    >
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">
        {title}
      </h2>

      <div className="mt-4 max-w-3xl pb-4 leading-7 text-slate-700 dark:text-slate-200">
        {children}
      </div>
    </section>
  );
}
