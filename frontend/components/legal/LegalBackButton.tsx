'use client';

import { useRouter } from 'next/navigation';

export default function LegalBackButton({ label }: { label: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex text-sm text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-300 dark:hover:text-white"
    >
      ← {label}
    </button>
  );
}
