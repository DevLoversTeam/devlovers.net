'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import type { JsonQuestion } from '@/lib/validation/admin-quiz';

import { JsonUploadArea } from './JsonUploadArea';

interface UploadMoreQuestionsProps {
  quizId: string;
  csrfToken: string;
}

export function UploadMoreQuestions({
  quizId,
  csrfToken,
}: UploadMoreQuestionsProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [questions, setQuestions] = useState<JsonQuestion[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleUpload() {
    if (questions.length === 0) {
      setError('Upload at least one JSON file first');
      return;
    }

    setError('');
    setSuccess('');
    setUploading(true);

    try {
      const res = await fetch(`/api/admin/quiz/${quizId}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ questions }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to upload questions');
        return;
      }

      setSuccess(`Added ${data.addedCount} questions (total: ${data.totalCount})`);
      setQuestions([]);
      setExpanded(false);
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border-border rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-foreground hover:bg-muted/50 flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors"
      >
        Upload More Questions
        <span className="text-muted-foreground text-xs">
          {expanded ? 'Hide' : 'Show'}
        </span>
      </button>

      {expanded && (
        <div className="border-border space-y-4 border-t px-4 py-4">
          <JsonUploadArea onQuestionsChange={setQuestions} />

          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-emerald-500">{success}</p>}

          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || questions.length === 0}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : `Upload ${questions.length} Questions`}
          </button>
        </div>
      )}
    </div>
  );
}
