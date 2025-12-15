import Link from 'next/link';

export function StatsCard() {
  const cardStyles = `
    relative overflow-hidden rounded-[2rem]
    border border-slate-200/70 dark:border-slate-700/80
    bg-white/60 dark:bg-slate-900/60 backdrop-blur-md
    shadow-[0_18px_45px_rgba(15,23,42,0.05)]
    dark:shadow-[0_22px_60px_rgba(0,0,0,0.2)]
    p-8 transition-all hover:border-sky-200 dark:hover:border-sky-800
  `;

  const primaryBtnStyles = `
    group relative inline-flex items-center justify-center rounded-full 
    px-8 py-3 text-sm font-semibold tracking-widest uppercase text-white 
    bg-gradient-to-r from-sky-500 via-indigo-500 to-pink-500 
    shadow-[0_4px_14px_rgba(56,189,248,0.4)] 
    dark:shadow-[0_4px_20px_rgba(129,140,248,0.4)] 
    transition-all hover:scale-105 hover:shadow-lg
  `;

  return (
    <div
      className={`${cardStyles} flex flex-col items-center justify-center text-center`}
    >
      <div className="mb-6 p-4 rounded-full bg-slate-50 dark:bg-slate-800/50 shadow-inner">
        <span className="text-4xl">📊</span>
      </div>

      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
        Quiz Statistics
      </h3>
      <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-xs mx-auto">
        Ready to level up? Challenge yourself with a new React quiz.
      </p>

      <Link href="/quiz/react-fundamentals" className={primaryBtnStyles}>
        <span className="relative z-10">Start a Quiz</span>
        <span className="absolute inset-0 rounded-full bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </Link>
    </div>
  );
}
