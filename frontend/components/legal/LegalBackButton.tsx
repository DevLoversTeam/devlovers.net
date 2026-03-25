'use client';

import { useRouter } from 'next/navigation';

export default function LegalBackButton({ label }: { label: string }) {
  const router = useRouter();

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex text-sm text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-300 dark:hover:text-white"
    >
      ← {label}
    </button>
  );
}
