import type { ReactNode } from 'react';
import Link from 'next/link';

interface CodeCardProps {
  fileName: string;
  snippet: ReactNode;
  className?: string;
}

function CodeCard({ fileName, snippet, className }: CodeCardProps) {
  return (
    <div
      className={`pointer-events-none absolute hidden md:block ${className}`}
      aria-hidden="true"
    >
      <div
        className="
          rounded-[2rem]
          border border-slate-200/70 dark:border-slate-700/80
          bg-gradient-to-b
          from-white via-slate-50 to-white
          dark:from-slate-900/95 dark:via-slate-950/95 dark:to-slate-950/95
          shadow-[0_18px_45px_rgba(15,23,42,0.18)]
          dark:shadow-[0_22px_60px_rgba(56,189,248,0.45)]
          px-5 py-4
          min-w-[230px]
        "
      >
        {/* top bar */}
        <div className="flex items-center justify-between mb-3 text-[10px] text-slate-500 dark:text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-400/90" />
            <span className="h-2 w-2 rounded-full bg-amber-300/90" />
            <span className="h-2 w-2 rounded-full bg-emerald-400/90" />
          </div>
          <span className="font-medium">{fileName}</span>
        </div>

        {/* colored code */}
        <code
          className="
            text-[11px] whitespace-pre leading-relaxed font-mono
            text-slate-700 dark:text-slate-100/90
          "
        >
          {snippet}
        </code>
      </div>
    </div>
  );
}

export default function HeroSection() {
  return (
    <section
      className="
        relative
        mx-[-1.5rem]
        w-[calc(100%+3rem)]
        overflow-hidden
        min-h-[100vh]
        flex
        items-center
      "
    >
      {/* background: light + dark */}
      <div
        className="
          absolute inset-0
          bg-gradient-to-b
          from-sky-50 via-white to-rose-50
          dark:from-slate-950 dark:via-slate-950 dark:to-black
        "
      />

      {/* soft radial glow behind content */}
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -top-32 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-sky-300/30 blur-3xl dark:bg-sky-500/25" />
        <div className="absolute bottom-[-12rem] left-1/4 h-[22rem] w-[22rem] rounded-full bg-pink-300/30 blur-3xl dark:bg-fuchsia-500/25" />
        <div className="absolute bottom-[-10rem] right-0 h-[26rem] w-[26rem] rounded-full bg-violet-300/40 blur-3xl dark:bg-violet-500/25" />
      </div>

      {/* simple "stars" */}
      <div className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-100">
        <span className="absolute left-[10%] top-[18%] h-1 w-1 rounded-full bg-sky-300/70 dark:bg-sky-400" />
        <span className="absolute left-[35%] top-[8%] h-1 w-1 rounded-full bg-fuchsia-300/70 dark:bg-fuchsia-400" />
        <span className="absolute left-[70%] top-[16%] h-1 w-1 rounded-full bg-amber-300/70 dark:bg-amber-300" />
        <span className="absolute left-[80%] top-[40%] h-0.5 w-0.5 rounded-full bg-sky-300/70 dark:bg-sky-400" />
        <span className="absolute left-[18%] top-[60%] h-0.5 w-0.5 rounded-full bg-violet-300/70 dark:bg-violet-400" />
      </div>

      {/* inner container */}
      <div
        className="
          relative
          max-w-5xl mx-auto
          w-full
          px-6
          py-24 md:py-32
          flex flex-col items-center text-center
        "
      >
        {/* code cards */}
        <CodeCard
          fileName="arrays.ts"
          className="left-8 -top-4 rotate-[-10deg]"
          snippet={
            <>
              <span className="text-sky-500 dark:text-sky-400">type</span> Arr1
              = [
              <span className="text-pink-500 dark:text-pink-400">
                &apos;a&apos;
              </span>
              ,{' '}
              <span className="text-pink-500 dark:text-pink-400">
                &apos;b&apos;
              </span>
              ,{' '}
              <span className="text-pink-500 dark:text-pink-400">
                &apos;c&apos;
              </span>
              ]{'\n'}
              <span className="text-sky-500 dark:text-sky-400">type</span> Arr2
              = [<span className="text-amber-500 dark:text-amber-400">3</span>,{' '}
              <span className="text-amber-500 dark:text-amber-400">2</span>,{' '}
              <span className="text-amber-500 dark:text-amber-400">1</span>]
            </>
          }
        />
        <CodeCard
          fileName="utils.js"
          className="right-8 -bottom-4 rotate-[8deg]"
          snippet={
            <>
              <span className="text-sky-500 dark:text-sky-400">function</span>{' '}
              sum(
              <span className="text-emerald-500 dark:text-emerald-400">
                a
              </span>,{' '}
              <span className="text-emerald-500 dark:text-emerald-400">b</span>){' '}
              {'{'}
              {'\n'}
              {'  '}
              <span className="text-sky-500 dark:text-sky-400">
                return
              </span>{' '}
              <span className="text-emerald-500 dark:text-emerald-400">a</span>{' '}
              <span className="text-pink-500 dark:text-pink-400">+</span>{' '}
              <span className="text-emerald-500 dark:text-emerald-400">b</span>;
              {'\n'}
              {'}'}
            </>
          }
        />

        {/* eyebrow */}
        <p
          className="
            text-[11px] sm:text-xs md:text-sm
            tracking-[0.35em]
            uppercase
            text-emerald-600/90
            dark:text-emerald-300/80
          "
        >
          ІНТЕРАКТИВНА ПІДГОТОВКА ДО СПІВБЕСІД ДЛЯ РОЗРОБНИКІВ
        </p>

        {/* title */}
        <div className="mt-10 sm:mt-12">
          <div className="-rotate-2 inline-block">
            <h1
              className="
                text-5xl sm:text-6xl md:text-7xl
                font-black
                tracking-tight
                drop-shadow-[0_0_22px_rgba(129,140,248,0.55)]
              "
            >
              <span
                className="
                  bg-gradient-to-r
                  from-sky-400 via-violet-400 to-pink-400
                  dark:from-sky-400 dark:via-indigo-400 dark:to-fuchsia-500
                  bg-clip-text
                  text-transparent
                "
              >
                DevLovers
              </span>
            </h1>
          </div>
        </div>

        {/* description */}
        <p
          className="
            mt-8 sm:mt-10
            max-w-2xl
            text-base sm:text-lg
            text-slate-700 dark:text-slate-200
          "
        >
          Практикуй типові питання, поглиблюй знання та проходь квізи перед
          співбесідами на Junior, Middle або Senior позиції.
        </p>

        {/* CTA */}
        <div className="mt-12">
          <Link
            href="/q&a"
            className="
              group
              relative
              inline-flex items-center
              rounded-full
              px-10 md:px-12
              py-3.5 md:py-4
              text-xs md:text-sm
              font-semibold
              tracking-[0.25em]
              uppercase
              text-white
              bg-gradient-to-r
              from-sky-500 via-indigo-500 to-pink-500
              shadow-[0_18px_45px_rgba(56,189,248,0.45)]
              dark:shadow-[0_22px_60px_rgba(129,140,248,0.6)]
              transition
              hover:scale-105
              hover:shadow-[0_24px_60px_rgba(56,189,248,0.6)]
              focus-visible:outline-none
              focus-visible:ring-2
              focus-visible:ring-ring
              focus-visible:ring-offset-2
            "
          >
            <span
              className="
                pointer-events-none
                absolute inset-[2px]
                rounded-full
                bg-gradient-to-r
                from-white/30 via-white/10 to-white/30
                opacity-40
                group-hover:opacity-60
                transition-opacity
              "
              aria-hidden="true"
            />
            <span className="relative z-10">Почати</span>
            <span
              className="
                relative z-10 ml-4
                h-px w-6
                bg-white/70
                group-hover:w-10
                transition-all
              "
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
