interface SectionHeadingProps {
  title: string;
  highlight?: string;
  subtitle?: string;
  align?: 'left' | 'center';
  className?: string;
}

export function SectionHeading({
  title,
  highlight,
  subtitle,
  align = 'center',
  className = '',
}: SectionHeadingProps) {
  return (
    <div
      className={`mb-12 ${align === 'center' ? 'mx-auto text-center' : ''} max-w-3xl ${className}`}
    >
      <h2 className="mb-6 text-4xl leading-[1.1] font-black tracking-tight text-gray-900 md:text-5xl lg:text-6xl dark:text-white">
        {title}
        {highlight && (
          <>
            {' '}
            <span className="animate-gradient bg-gradient-to-r from-[#1e5eff] via-[#1e5eff]/70 to-[#1e5eff] bg-[length:200%_auto] bg-clip-text text-transparent dark:from-[#ff2d55] dark:via-[#ff2d55]/70 dark:to-[#ff2d55]">
              {highlight}
            </span>
          </>
        )}
      </h2>
      {subtitle && (
        <p className="mx-auto max-w-2xl text-lg leading-relaxed font-light text-gray-700 md:text-xl dark:text-neutral-300">
          {subtitle}
        </p>
      )}
    </div>
  );
}
