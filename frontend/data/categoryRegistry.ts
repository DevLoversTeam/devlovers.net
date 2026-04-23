type CategoryRegistryItem<TSlug extends string = string, TTitle extends string = string> = {
  slug: TSlug;
  title: TTitle;
  displayOrder: number;
  icon: string;
  accent: string;
  iconClassName?: string;
  colorClassName: string;
  glowClassName: string;
};

const createRegistryItem = <
  TSlug extends string,
  TTitle extends string,
>(
  slug: TSlug,
  title: TTitle,
  displayOrder: number,
  icon: string,
  accent: string,
  colorClassName: string,
  glowClassName: string,
  options?: { iconClassName?: string }
): CategoryRegistryItem<TSlug, TTitle> => ({
  slug,
  title,
  displayOrder,
  icon,
  accent,
  colorClassName,
  glowClassName,
  iconClassName: options?.iconClassName,
});

export const categoryRegistry = [
  createRegistryItem(
    'git',
    'Git',
    0,
    '/icons/git.svg',
    '#C1121F',
    'group-hover:border-[#C1121F]/50 group-hover:bg-[#C1121F]/10 data-[state=active]:border-[#C1121F]/50 data-[state=active]:bg-[#C1121F]/10',
    'bg-[#C1121F]'
  ),
  createRegistryItem(
    'html',
    'HTML',
    1,
    '/icons/html5.svg',
    '#E34F26',
    'group-hover:border-[#E34F26]/50 group-hover:bg-[#E34F26]/10 data-[state=active]:border-[#E34F26]/50 data-[state=active]:bg-[#E34F26]/10',
    'bg-[#E34F26]'
  ),
  createRegistryItem(
    'css',
    'CSS',
    2,
    '/icons/css3.svg',
    '#7C4DFF',
    'group-hover:border-[#7C4DFF]/50 group-hover:bg-[#7C4DFF]/10 data-[state=active]:border-[#7C4DFF]/50 data-[state=active]:bg-[#7C4DFF]/10',
    'bg-[#7C4DFF]'
  ),
  createRegistryItem(
    'javascript',
    'JavaScript',
    3,
    '/icons/javascript.svg',
    '#F7DF1E',
    'group-hover:border-[#F7DF1E]/50 group-hover:bg-[#F7DF1E]/10 data-[state=active]:border-[#F7DF1E]/50 data-[state=active]:bg-[#F7DF1E]/10',
    'bg-[#F7DF1E]'
  ),
  createRegistryItem(
    'typescript',
    'TypeScript',
    4,
    '/icons/typescript.svg',
    '#3178C6',
    'group-hover:border-[#3178C6]/50 group-hover:bg-[#3178C6]/10 data-[state=active]:border-[#3178C6]/50 data-[state=active]:bg-[#3178C6]/10',
    'bg-[#3178C6]'
  ),
  createRegistryItem(
    'react',
    'React',
    5,
    '/icons/react.svg',
    '#61DAFB',
    'group-hover:border-[#61DAFB]/50 group-hover:bg-[#61DAFB]/10 data-[state=active]:border-[#61DAFB]/50 data-[state=active]:bg-[#61DAFB]/10',
    'bg-[#61DAFB]'
  ),
  createRegistryItem(
    'next',
    'Next.js',
    6,
    '/icons/nextjs.svg',
    '#A1A1AA',
    'group-hover:border-black/50 dark:group-hover:border-white/50 group-hover:bg-black/5 dark:group-hover:bg-white/10 data-[state=active]:border-black/50 dark:data-[state=active]:border-white/50 data-[state=active]:bg-black/5 dark:data-[state=active]:bg-white/10',
    'bg-black dark:bg-white',
    {
      iconClassName: 'dark:invert',
    }
  ),
  createRegistryItem(
    'vue',
    'Vue.js',
    7,
    '/icons/vuejs.svg',
    '#4FC08D',
    'group-hover:border-[#4FC08D]/50 group-hover:bg-[#4FC08D]/10 data-[state=active]:border-[#4FC08D]/50 data-[state=active]:bg-[#4FC08D]/10',
    'bg-[#4FC08D]'
  ),
  createRegistryItem(
    'angular',
    'Angular',
    8,
    '/icons/angular.svg',
    '#DD0031',
    'group-hover:border-[#DD0031]/50 group-hover:bg-[#DD0031]/10 data-[state=active]:border-[#DD0031]/50 data-[state=active]:bg-[#DD0031]/10',
    'bg-[#DD0031]'
  ),
  createRegistryItem(
    'node',
    'Node.js',
    9,
    '/icons/nodejs.svg',
    '#339933',
    'group-hover:border-[#339933]/50 group-hover:bg-[#339933]/10 data-[state=active]:border-[#339933]/50 data-[state=active]:bg-[#339933]/10',
    'bg-[#339933]'
  ),
  createRegistryItem(
    'sql',
    'SQL',
    10,
    '/icons/sql.svg',
    '#0072C6',
    'group-hover:border-[#0072C6]/50 group-hover:bg-[#0072C6]/10 data-[state=active]:border-[#0072C6]/50 data-[state=active]:bg-[#0072C6]/10',
    'bg-[#0072C6]'
  ),
  createRegistryItem(
    'postgresql',
    'PostgreSQL',
    11,
    '/icons/postgresql.svg',
    '#336791',
    'group-hover:border-[#336791]/50 group-hover:bg-[#336791]/10 data-[state=active]:border-[#336791]/50 data-[state=active]:bg-[#336791]/10',
    'bg-[#336791]'
  ),
  createRegistryItem(
    'mongodb',
    'MongoDB',
    12,
    '/icons/mongodb.svg',
    '#47A248',
    'group-hover:border-[#47A248]/50 group-hover:bg-[#47A248]/10 data-[state=active]:border-[#47A248]/50 data-[state=active]:bg-[#47A248]/10',
    'bg-[#47A248]'
  ),
  createRegistryItem(
    'python',
    'Python',
    13,
    '/icons/python.svg',
    '#3776AB',
    'group-hover:border-[#3776AB]/50 group-hover:bg-[#3776AB]/10 data-[state=active]:border-[#3776AB]/50 data-[state=active]:bg-[#3776AB]/10',
    'bg-[#3776AB]'
  ),
  createRegistryItem(
    'django',
    'Django',
    14,
    '/icons/django.svg',
    '#0E7A53',
    'group-hover:border-[#0E7A53]/50 group-hover:bg-[#0E7A53]/10 data-[state=active]:border-[#0E7A53]/50 data-[state=active]:bg-[#0E7A53]/10',
    'bg-[#0E7A53]'
  ),
  createRegistryItem(
    'docker',
    'Docker',
    15,
    '/icons/docker.svg',
    '#1D63ED',
    'group-hover:border-[#1D63ED]/50 group-hover:bg-[#1D63ED]/10 data-[state=active]:border-[#1D63ED]/50 data-[state=active]:bg-[#1D63ED]/10',
    'bg-[#1D63ED]'
  ),
  createRegistryItem(
    'kubernetes',
    'Kubernetes',
    16,
    '/icons/kubernetes.svg',
    '#326CE5',
    'group-hover:border-[#326CE5]/50 group-hover:bg-[#326CE5]/10 data-[state=active]:border-[#326CE5]/50 data-[state=active]:bg-[#326CE5]/10',
    'bg-[#326CE5]'
  ),
  createRegistryItem(
    'aws',
    'AWS',
    17,
    '/icons/aws.svg',
    '#FF9900',
    'group-hover:border-[#FF9900]/50 group-hover:bg-[#FF9900]/10 data-[state=active]:border-[#FF9900]/50 data-[state=active]:bg-[#FF9900]/10',
    'bg-[#FF9900]',
    {
      iconClassName: 'dark:invert dark:hue-rotate-180 dark:brightness-110',
    }
  ),
  createRegistryItem(
    'azure',
    'Azure',
    18,
    '/icons/azure.svg',
    '#0078D4',
    'group-hover:border-[#0078D4]/50 group-hover:bg-[#0078D4]/10 data-[state=active]:border-[#0078D4]/50 data-[state=active]:bg-[#0078D4]/10',
    'bg-[#0078D4]'
  ),
  createRegistryItem(
    'devops',
    'DevOps',
    19,
    '/icons/devops.svg',
    '#0052CC',
    'group-hover:border-[#0052CC]/50 group-hover:bg-[#0052CC]/10 data-[state=active]:border-[#0052CC]/50 data-[state=active]:bg-[#0052CC]/10',
    'bg-[#0052CC]'
  ),
  createRegistryItem(
    'swift',
    'Swift',
    20,
    '/icons/swift.svg',
    '#F05138',
    'group-hover:border-[#F05138]/50 group-hover:bg-[#F05138]/10 data-[state=active]:border-[#F05138]/50 data-[state=active]:bg-[#F05138]/10',
    'bg-[#F05138]'
  ),
  createRegistryItem(
    'flutter',
    'Flutter',
    21,
    '/icons/flutter.svg',
    '#02569B',
    'group-hover:border-[#02569B]/50 group-hover:bg-[#02569B]/10 data-[state=active]:border-[#02569B]/50 data-[state=active]:bg-[#02569B]/10',
    'bg-[#02569B]'
  ),
  createRegistryItem(
    'kotlin',
    'Kotlin',
    22,
    '/icons/kotlin.svg',
    '#7F52FF',
    'group-hover:border-[#7F52FF]/50 group-hover:bg-[#7F52FF]/10 data-[state=active]:border-[#7F52FF]/50 data-[state=active]:bg-[#7F52FF]/10',
    'bg-[#7F52FF]'
  ),
  createRegistryItem(
    'reactnative',
    'React Native',
    23,
    '/icons/reactnative.svg',
    '#61DAFB',
    'group-hover:border-[#61DAFB]/50 group-hover:bg-[#61DAFB]/10 data-[state=active]:border-[#61DAFB]/50 data-[state=active]:bg-[#61DAFB]/10',
    'bg-[#61DAFB]'
  ),
  createRegistryItem(
    'java',
    'Java',
    24,
    '/icons/java.svg',
    '#0074BD',
    'group-hover:border-[#0074BD]/50 group-hover:bg-[#0074BD]/10 data-[state=active]:border-[#0074BD]/50 data-[state=active]:bg-[#0074BD]/10',
    'bg-[#0074BD]'
  ),
  createRegistryItem(
    'spring',
    'Spring',
    25,
    '/icons/spring.svg',
    '#77BC1F',
    'group-hover:border-[#77BC1F]/50 group-hover:bg-[#77BC1F]/10 data-[state=active]:border-[#77BC1F]/50 data-[state=active]:bg-[#77BC1F]/10',
    'bg-[#77BC1F]'
  ),
  createRegistryItem(
    'php',
    'PHP',
    26,
    '/icons/php.svg',
    '#777BB4',
    'group-hover:border-[#777BB4]/50 group-hover:bg-[#777BB4]/10 data-[state=active]:border-[#777BB4]/50 data-[state=active]:bg-[#777BB4]/10',
    'bg-[#777BB4]'
  ),
  createRegistryItem(
    'laravel',
    'Laravel',
    27,
    '/icons/laravel.svg',
    '#FF2D20',
    'group-hover:border-[#FF2D20]/50 group-hover:bg-[#FF2D20]/10 data-[state=active]:border-[#FF2D20]/50 data-[state=active]:bg-[#FF2D20]/10',
    'bg-[#FF2D20]'
  ),
  createRegistryItem(
    'csharp',
    'C#',
    28,
    '/icons/csharp.svg',
    '#9B4F96',
    'group-hover:border-[#9B4F96]/50 group-hover:bg-[#9B4F96]/10 data-[state=active]:border-[#9B4F96]/50 data-[state=active]:bg-[#9B4F96]/10',
    'bg-[#9B4F96]'
  ),
  createRegistryItem(
    'dotnet',
    '.NET',
    29,
    '/icons/dotnet.svg',
    '#512BD4',
    'group-hover:border-[#512BD4]/50 group-hover:bg-[#512BD4]/10 data-[state=active]:border-[#512BD4]/50 data-[state=active]:bg-[#512BD4]/10',
    'bg-[#512BD4]'
  ),
] as const satisfies readonly CategoryRegistryItem[];

export type CategoryRegistryEntry = (typeof categoryRegistry)[number];
