import type { CategorySlug } from '@/components/q&a/types';

export type CategoryTabStyle = {
  icon: string;
  color: string;
  glow: string;
  accent: string;
  iconClassName?: string;
};

export const defaultCategoryTabStyle: CategoryTabStyle = {
  icon: '/icons/code.svg',
  color:
    'group-hover:border-[#A1A1AA]/50 group-hover:bg-[#A1A1AA]/10 data-[state=active]:border-[#A1A1AA]/50 data-[state=active]:bg-[#A1A1AA]/10',
  glow: 'bg-[#A1A1AA]',
  accent: '#A1A1AA',
};

export const categoryTabStyles = {
  git: {
    icon: '/icons/git.svg',
    color:
      'group-hover:border-[#F05032]/50 group-hover:bg-[#F05032]/10 data-[state=active]:border-[#F05032]/50 data-[state=active]:bg-[#F05032]/10',
    glow: 'bg-[#F05032]',
    accent: '#F05032',
  },
  html: {
    icon: '/icons/html5.svg',
    color:
      'group-hover:border-[#E34F26]/50 group-hover:bg-[#E34F26]/10 data-[state=active]:border-[#E34F26]/50 data-[state=active]:bg-[#E34F26]/10',
    glow: 'bg-[#E34F26]',
    accent: '#E34F26',
  },
  css: {
    icon: '/icons/css3.svg',
    color:
      'group-hover:border-[#7C4DFF]/50 group-hover:bg-[#7C4DFF]/10 data-[state=active]:border-[#7C4DFF]/50 data-[state=active]:bg-[#7C4DFF]/10',
    glow: 'bg-[#7C4DFF]',
    accent: '#7C4DFF',
  },
  javascript: {
    icon: '/icons/javascript.svg',
    color:
      'group-hover:border-[#F7DF1E]/50 group-hover:bg-[#F7DF1E]/10 data-[state=active]:border-[#F7DF1E]/50 data-[state=active]:bg-[#F7DF1E]/10',
    glow: 'bg-[#F7DF1E]',
    accent: '#F7DF1E',
  },
  typescript: {
    icon: '/icons/typescript.svg',
    color:
      'group-hover:border-[#3178C6]/50 group-hover:bg-[#3178C6]/10 data-[state=active]:border-[#3178C6]/50 data-[state=active]:bg-[#3178C6]/10',
    glow: 'bg-[#3178C6]',
    accent: '#3178C6',
  },
  react: {
    icon: '/icons/react.svg',
    color:
      'group-hover:border-[#61DAFB]/50 group-hover:bg-[#61DAFB]/10 data-[state=active]:border-[#61DAFB]/50 data-[state=active]:bg-[#61DAFB]/10',
    glow: 'bg-[#61DAFB]',
    accent: '#61DAFB',
  },
  next: {
    icon: '/icons/nextjs.svg',
    color:
      'group-hover:border-black/50 dark:group-hover:border-white/50 group-hover:bg-black/5 dark:group-hover:bg-white/10 data-[state=active]:border-black/50 dark:data-[state=active]:border-white/50 data-[state=active]:bg-black/5 dark:data-[state=active]:bg-white/10',
    glow: 'bg-black dark:bg-white',
    iconClassName: 'dark:invert',
    accent: '#A1A1AA',
  },
  vue: {
    icon: '/icons/vuejs.svg',
    color:
      'group-hover:border-[#4FC08D]/50 group-hover:bg-[#4FC08D]/10 data-[state=active]:border-[#4FC08D]/50 data-[state=active]:bg-[#4FC08D]/10',
    glow: 'bg-[#4FC08D]',
    accent: '#4FC08D',
  },
  angular: {
    icon: '/icons/angular.svg',
    color:
      'group-hover:border-[#DD0031]/50 group-hover:bg-[#DD0031]/10 data-[state=active]:border-[#DD0031]/50 data-[state=active]:bg-[#DD0031]/10',
    glow: 'bg-[#DD0031]',
    accent: '#DD0031',
  },
  node: {
    icon: '/icons/nodejs.svg',
    color:
      'group-hover:border-[#339933]/50 group-hover:bg-[#339933]/10 data-[state=active]:border-[#339933]/50 data-[state=active]:bg-[#339933]/10',
    glow: 'bg-[#339933]',
    accent: '#339933',
  },
  sql: {
    icon: '/icons/sql.svg',
    color:
      'group-hover:border-[#0072C6]/50 group-hover:bg-[#0072C6]/10 data-[state=active]:border-[#0072C6]/50 data-[state=active]:bg-[#0072C6]/10',
    glow: 'bg-[#0072C6]',
    accent: '#0072C6',
  },
  postgresql: {
    icon: '/icons/postgresql.svg',
    color:
      'group-hover:border-[#336791]/50 group-hover:bg-[#336791]/10 data-[state=active]:border-[#336791]/50 data-[state=active]:bg-[#336791]/10',
    glow: 'bg-[#336791]',
    accent: '#336791',
  },
  mongodb: {
    icon: '/icons/mongodb.svg',
    color:
      'group-hover:border-[#47A248]/50 group-hover:bg-[#47A248]/10 data-[state=active]:border-[#47A248]/50 data-[state=active]:bg-[#47A248]/10',
    glow: 'bg-[#47A248]',
    accent: '#47A248',
  },
  python: {
    icon: '/icons/python.svg',
    color:
      'group-hover:border-[#3776AB]/50 group-hover:bg-[#3776AB]/10 data-[state=active]:border-[#3776AB]/50 data-[state=active]:bg-[#3776AB]/10',
    glow: 'bg-[#3776AB]',
    accent: '#3776AB',
  },
} as const satisfies Partial<Record<CategorySlug, CategoryTabStyle>>;

export function getCategoryTabStyle(slug: string): CategoryTabStyle {
  return (
    (categoryTabStyles as Record<string, CategoryTabStyle>)[slug] ??
    defaultCategoryTabStyle
  );
}
