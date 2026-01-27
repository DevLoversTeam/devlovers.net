import { CodeCard } from './CodeCard';

export function HeroCodeCards() {
  return (
    <>
      <CodeCard
        fileName="arrays.ts"
        className="left-4 md:left-10 lg:left-8 xl:left-12 -top-2 md:-top-12 lg:-top-8 xl:-top-12 rotate-[-10deg]"
        snippet={
          <>
            <span className="text-[var(--accent-primary)]">type</span> Arr1 = [
            <span className="text-emerald-500 dark:text-emerald-400">
              &apos;a&apos;
            </span>
            ,{' '}
            <span className="text-emerald-500 dark:text-emerald-400">
              &apos;b&apos;
            </span>
            ,{' '}
            <span className="text-emerald-500 dark:text-emerald-400">
              &apos;c&apos;
            </span>
            ]{'\n'}
            <span className="text-[var(--accent-primary)]">type</span> Arr2 = [
            <span className="text-amber-500 dark:text-amber-400">3</span>,{' '}
            <span className="text-amber-500 dark:text-amber-400">2</span>,{' '}
            <span className="text-amber-500 dark:text-amber-400">1</span>]
          </>
        }
      />

      <CodeCard
        fileName="utils.js"
        className="right-4 md:right-4 lg:right-8 xl:right-12 -bottom-2 md:-bottom-6 lg:-bottom-8 xl:-bottom-12 rotate-[8deg]"
        snippet={
          <>
            <span className="text-[var(--accent-primary)]">function</span> sum(
            <span className="text-emerald-500 dark:text-emerald-400">
              a
            </span>,{' '}
            <span className="text-emerald-500 dark:text-emerald-400">b</span>){' '}
            {'{'}
            {'\n'}
            {'  '}
            <span className="text-[var(--accent-primary)]">return</span>{' '}
            <span className="text-emerald-500 dark:text-emerald-400">a</span>{' '}
            <span className="text-purple-500 dark:text-purple-400">+</span>{' '}
            <span className="text-emerald-500 dark:text-emerald-400">b</span>;
            {'\n'}
            {'}'}
          </>
        }
      />
    </>
  );
}
