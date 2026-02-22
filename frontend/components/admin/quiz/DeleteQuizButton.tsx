'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface DeleteQuizButtonProps {
  quizId: string;
  csrfToken: string;
}

export function DeleteQuizButton({ quizId, csrfToken }: DeleteQuizButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      'Delete this draft quiz? This action cannot be undone.'
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/quiz/${quizId}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrfToken },
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error ?? 'Failed to delete quiz');
        return;
      }

      router.refresh();
    } catch {
      alert('Network error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="rounded-md border border-red-500/50 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
    >
      {deleting ? 'Deleting...' : 'Delete Quiz'}
    </button>
  );
}
