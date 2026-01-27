export function HeroBackground() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-32 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-[var(--accent-primary)]/20 blur-3xl" />
        <div className="absolute bottom-[-12rem] left-1/4 h-[22rem] w-[22rem] rounded-full bg-[var(--accent-hover)]/15 blur-3xl" />
        <div className="absolute bottom-[-10rem] right-0 h-[26rem] w-[26rem] rounded-full bg-[var(--accent-primary)]/25 blur-3xl" />
      </div>

      <div className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-60">
        <span className="absolute left-[10%] top-[18%] h-1 w-1 rounded-full bg-[var(--accent-primary)]" />
        <span className="absolute left-[35%] top-[8%] h-1 w-1 rounded-full bg-[var(--accent-hover)]" />
        <span className="absolute left-[70%] top-[16%] h-1 w-1 rounded-full bg-[var(--accent-primary)]" />
        <span className="absolute left-[80%] top-[40%] h-1 w-1 rounded-full bg-[var(--accent-hover)]" />
        <span className="absolute left-[18%] top-[60%] h-1 w-1 rounded-full bg-[var(--accent-primary)]" />
      </div>
    </>
  );
}
