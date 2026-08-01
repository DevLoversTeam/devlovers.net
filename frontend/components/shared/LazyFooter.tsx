'use client';

import dynamic from 'next/dynamic';

const LazyFooter = dynamic(() => import('./Footer'));

export default LazyFooter;
