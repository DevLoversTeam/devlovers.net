export interface CTAVariant {
  text: string;
  gradient: string;
  gradientDark: string;
  shadow: string;
  shadowDark: string;
  ring: string;
}

export const createCTAVariants = (ctaText: string): CTAVariant[] => [
  {
    text: `${ctaText} 1`,
    gradient: 'from-[var(--accent-primary)] to-[var(--accent-hover)]',
    gradientDark:
      'dark:from-[var(--accent-primary)] dark:to-[var(--accent-hover)]',
    shadow: 'shadow-[0_18px_45px_rgba(30,94,255,0.35)]',
    shadowDark: 'dark:shadow-[0_22px_60px_rgba(255,45,85,0.5)]',
    ring: 'focus-visible:ring-[var(--accent-primary)]',
  },
  {
    text: `${ctaText} 2`,
    gradient: 'from-[#60a5fa] to-[#3b82f6]',
    gradientDark: 'dark:from-[#ff6b9d] dark:to-[#ff477e]',
    shadow: 'shadow-[0_18px_45px_rgba(96,165,250,0.35)]',
    shadowDark: 'dark:shadow-[0_22px_60px_rgba(255,107,157,0.5)]',
    ring: 'focus-visible:ring-[#60a5fa] dark:focus-visible:ring-[#ff6b9d]',
  },
  {
    text: `${ctaText} 3`,
    gradient: 'from-[#2563eb] to-[#1e40af]',
    gradientDark: 'dark:from-[#f87171] dark:to-[#ef4444]',
    shadow: 'shadow-[0_18px_45px_rgba(37,99,235,0.35)]',
    shadowDark: 'dark:shadow-[0_22px_60px_rgba(239,68,68,0.5)]',
    ring: 'focus-visible:ring-[#2563eb] dark:focus-visible:ring-[#f87171]',
  },
  {
    text: `${ctaText} 4`,
    gradient: 'from-[#3b82f6] to-[#2563eb]',
    gradientDark: 'dark:from-[#fb7185] dark:to-[#e11d48]',
    shadow: 'shadow-[0_18px_45px_rgba(59,130,246,0.35)]',
    shadowDark: 'dark:shadow-[0_22px_60px_rgba(225,29,72,0.5)]',
    ring: 'focus-visible:ring-[#3b82f6] dark:focus-visible:ring-[#fb7185]',
  },
  {
    text: `${ctaText} 5`,
    gradient: 'from-[#2563eb] to-[#1d4ed8]',
    gradientDark: 'dark:from-[#fca5a5] dark:to-[#ef4444]',
    shadow: 'shadow-[0_18px_45px_rgba(37,99,235,0.35)]',
    shadowDark: 'dark:shadow-[0_22px_60px_rgba(239,68,68,0.5)]',
    ring: 'focus-visible:ring-[#2563eb] dark:focus-visible:ring-[#fca5a5]',
  },
];
