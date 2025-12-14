type Props = {
  id: string;
  title: string;
  children: React.ReactNode;
};

export default function LegalBlock({ id, title, children }: Props) {
  return (
    <section
      id={id}
      className="
        py-8 sm:py-10
        border-b border-gray-200/60
        dark:border-neutral-800/60
        last:border-b-0
      "
    >
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        {title}
      </h2>

      <div className="mt-4 pb-4 max-w-3xl text-slate-700 dark:text-slate-200 leading-7">
        {children}
      </div>
    </section>
  );
}
