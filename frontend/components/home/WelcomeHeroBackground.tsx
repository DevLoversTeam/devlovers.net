import React from 'react';

export function WelcomeHeroBackground() {
  return (
    <>
      <div className="absolute top-0 left-0 -z-10 h-full w-full overflow-hidden">
        <div className="absolute top-[-10rem] left-[-10rem] h-[30rem] w-[30rem] rounded-full bg-[var(--accent-primary)]/20 blur-3xl" />
        <div className="absolute bottom-[-12rem] left-1/4 h-[22rem] w-[22rem] rounded-full bg-[var(--accent-hover)]/15 blur-3xl" />
        <div className="absolute right-0 bottom-[-10rem] h-[26rem] w-[26rem] rounded-full bg-[var(--accent-primary)]/25 blur-3xl" />
      </div>

      <div className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-60">
        <span className="absolute top-[18%] left-[10%] h-1 w-1 rounded-full bg-[var(--accent-primary)]" />
        <span className="absolute top-[8%] left-[35%] h-1 w-1 rounded-full bg-[var(--accent-hover)]" />
        <span className="absolute top-[16%] left-[70%] h-1 w-1 rounded-full bg-[var(--accent-primary)]" />
        <span className="absolute top-[40%] left-[80%] h-1 w-1 rounded-full bg-[var(--accent-hover)]" />
        <span className="absolute top-[60%] left-[18%] h-1 w-1 rounded-full bg-[var(--accent-primary)]" />
      </div>
    </>
  );
}
