'use client';

import type { ReactNode, MouseEvent } from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion';

import { cn } from '@/lib/utils';

type DynamicGridBackgroundProps = {
  className?: string;
  children?: ReactNode;
};

export function DynamicGridBackground({
  className,
  children,
}: DynamicGridBackgroundProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const maskImage = useMotionTemplate`radial-gradient(300px circle at ${mouseX}px ${mouseY}px, black, transparent)`;

  function handleMouseMove(event: MouseEvent<HTMLElement>) {
    const { left, top } = event.currentTarget.getBoundingClientRect();
    mouseX.set(event.clientX - left);
    mouseY.set(event.clientY - top);
  }

  return (
    <section
      onMouseMove={handleMouseMove}
      className={cn('group/dynamic relative overflow-hidden', className)}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_70%,transparent_100%)]" />
      </div>

      <motion.div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/dynamic:opacity-100"
        style={{
          maskImage,
          WebkitMaskImage: maskImage,
        }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e5eff_1px,transparent_1px),linear-gradient(to_bottom,#1e5eff_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#ff2d55_1px,transparent_1px),linear-gradient(to_bottom,#ff2d55_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 dark:opacity-30" />
      </motion.div>

      {children}
    </section>
  );
}
