'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

const Footer = dynamic(() => import('./Footer'));

export default function LazyFooter(props: { forceVisible?: boolean }) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [nearViewport, setNearViewport] = useState(false);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (!nearViewport) {
    return <div ref={sentinelRef} aria-hidden="true" />;
  }

  return <Footer {...props} />;
}
