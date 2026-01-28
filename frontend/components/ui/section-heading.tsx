interface SectionHeadingProps {
  title: string
  highlight?: string
  subtitle?: string
  align?: "left" | "center"
  className?: string
}

export function SectionHeading({ title, highlight, subtitle, align = "center", className }: SectionHeadingProps) {
  return (
    <div className={`mb-12 ${align === "center" ? "text-center mx-auto" : ""} max-w-3xl ${className}`}>
      <h2 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 tracking-tight text-gray-900 dark:text-white leading-[1.1]">
        {title} 
        {highlight && (
          <> <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1e5eff] via-[#1e5eff]/70 to-[#1e5eff] dark:from-[#ff2d55] dark:via-[#ff2d55]/70 dark:to-[#ff2d55] bg-[length:200%_auto] animate-gradient">{highlight}</span></>
        )}
      </h2>
      {subtitle && (
        <p className="text-lg md:text-xl text-gray-700 dark:text-neutral-300 font-light leading-relaxed max-w-2xl mx-auto">
          {subtitle}
        </p>
      )}
    </div>
  )
}
