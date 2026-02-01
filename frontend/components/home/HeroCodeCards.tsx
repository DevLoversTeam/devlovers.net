import { CodeCard } from './CodeCard';

export function HeroCodeCards() {
  return (
    <>
      <CodeCard
        fileName="arrays.ts"
        className="lg:left-16 lg:top-0"
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
        className="lg:right-20 lg:bottom-16"
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
