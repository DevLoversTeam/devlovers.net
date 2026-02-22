'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

interface ConfirmModal {
  title: string;
  message: string;
  action: () => void;
  variant: 'default' | 'danger';
}

interface QuizStatusControlsProps {
  quizId: string;
  status: string;
  isActive: boolean;
  csrfToken: string;
}

export function QuizStatusControls({
  quizId,
  status,
  isActive,
  csrfToken,
}: QuizStatusControlsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [modal, setModal] = useState<ConfirmModal | null>(null);

  const isDraft = status === 'draft';

  async function patchQuiz(body: Record<string, unknown>) {
    setLoading(Object.keys(body)[0]);
    setErrors([]);

    try {
      const res = await fetch(`/api/admin/quiz/${quizId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'PUBLISH_VALIDATION_FAILED' && Array.isArray(data.details)) {
          setErrors(data.details);
        } else {
          setErrors([data.error ?? 'Operation failed']);
        }
        return;
      }

      router.refresh();
    } catch {
      setErrors(['Network error']);
    } finally {
      setLoading(null);
    }
  }

  function requestMarkReady() {
    setModal({
      title: 'Mark as Ready',
      message: 'Change status from Draft to Ready? The quiz will be validated for completeness (all translations must be present).',
      variant: 'default',
      action: () => patchQuiz({ status: 'ready' }),
    });
  }

  function requestRevertDraft() {
    setModal({
      title: 'Revert to Draft',
      message: 'Change status from Ready back to Draft? You will be able to add/delete questions and upload more content.',
      variant: 'danger',
      action: () => patchQuiz({ status: 'draft' }),
    });
  }

  function requestActivate() {
    setModal({
      title: 'Activate Quiz',
      message: 'Make this quiz visible to users on the public quiz list?',
      variant: 'default',
      action: () => patchQuiz({ isActive: true }),
    });
  }

  function requestDeactivate() {
    setModal({
      title: 'Deactivate Quiz',
      message: 'Hide this quiz from the public quiz list? Users with active sessions can still finish.',
      variant: 'danger',
      action: () => patchQuiz({ isActive: false }),
    });
  }

  function confirmAction() {
    modal?.action();
    setModal(null);
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {isDraft ? (
            <button
              type="button"
              onClick={requestMarkReady}
              disabled={loading !== null}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading === 'status' ? 'Updating...' : 'Mark as Ready'}
            </button>
          ) : (
            <button
              type="button"
              onClick={requestRevertDraft}
              disabled={loading !== null}
              className="border-border text-foreground hover:bg-secondary rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading === 'status' ? 'Updating...' : 'Revert to Draft'}
            </button>
          )}

          {isActive ? (
            <button
              type="button"
              onClick={requestDeactivate}
              disabled={loading !== null}
              className="rounded-md border border-red-500/50 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
            >
              {loading === 'isActive' ? 'Updating...' : 'Deactivate'}
            </button>
          ) : (
            <button
              type="button"
              onClick={requestActivate}
              disabled={loading !== null}
              className="border-border text-foreground hover:bg-secondary rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading === 'isActive' ? 'Updating...' : 'Activate'}
            </button>
          )}
        </div>

        {errors.length > 0 && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
            <p className="mb-1 text-sm font-medium text-red-500">
              {errors.length === 1 ? errors[0] : 'Validation failed:'}
            </p>
            {errors.length > 1 && (
              <ul className="list-inside list-disc space-y-0.5 text-xs text-red-400">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setModal(null)}
          />
          <div className="bg-background border-border relative z-10 w-full max-w-md rounded-lg border p-6 shadow-lg">
            <h3 className="text-foreground text-lg font-semibold">{modal.title}</h3>
            <p className="text-muted-foreground mt-2 text-sm">{modal.message}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="border-border text-foreground hover:bg-secondary rounded-md border px-4 py-2 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAction}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  modal.variant === 'danger'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
