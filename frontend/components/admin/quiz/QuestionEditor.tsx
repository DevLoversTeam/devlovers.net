'use client';

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import type { AnswerBlock } from '@/components/q&a/types';
import type { AdminQuizQuestion } from '@/db/queries/quizzes/admin-quiz';
import { cn } from '@/lib/utils';

import { AnswerEditor } from './AnswerEditor';
import { ExplanationEditor } from './ExplanationEditor';
import { type AdminLocale, LocaleTabs } from './LocaleTabs';

const ALL_LOCALES: AdminLocale[] = ['en', 'uk', 'pl'];

type Difficulty = 'beginner' | 'medium' | 'advanced';

type LocaleContent = {
  questionText: string;
  explanation: AnswerBlock[];
};

type AnswerState = {
  id: string;
  displayOrder: number;
  isCorrect: boolean;
  translations: Record<AdminLocale, string>;
};

type EditorState = {
  locales: Record<AdminLocale, LocaleContent>;
  answers: AnswerState[];
  difficulty: Difficulty;
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function initEditorState(question: AdminQuizQuestion): EditorState {
  return {
    locales: {
      en: {
        questionText: question.content.en?.questionText ?? '',
        explanation: (question.content.en?.explanation ?? []) as AnswerBlock[],
      },
      uk: {
        questionText: question.content.uk?.questionText ?? '',
        explanation: (question.content.uk?.explanation ?? []) as AnswerBlock[],
      },
      pl: {
        questionText: question.content.pl?.questionText ?? '',
        explanation: (question.content.pl?.explanation ?? []) as AnswerBlock[],
      },
    },
    answers: question.answers.map(a => ({
      id: a.id,
      displayOrder: a.displayOrder,
      isCorrect: a.isCorrect,
      translations: {
        en: a.translations.en?.answerText ?? '',
        uk: a.translations.uk?.answerText ?? '',
        pl: a.translations.pl?.answerText ?? '',
      },
    })),
   difficulty: question.difficulty as Difficulty,
  };
}

function validate(state: EditorState): string | null {
  for (const locale of ALL_LOCALES) {
    if (!state.locales[locale].questionText.trim()) {
      return `Question text is empty for ${locale.toUpperCase()}`;
    }
    if (state.locales[locale].explanation.length === 0) {
      return `Explanation is empty for ${locale.toUpperCase()}`;
    }
    for (const answer of state.answers) {
      if (!answer.translations[locale].trim()) {
        return `Answer text is empty for ${locale.toUpperCase()}`;
      }
    }
  }
  return null;
}

interface QuestionEditorProps {
  question: AdminQuizQuestion;
  index: number;
  quizId: string;
  csrfToken: string;
  csrfTokenDelete?: string;
  isDraft?: boolean;
  isEditing: boolean;
  isDisabled: boolean;
  onEditStart: () => void;
  onEditEnd: () => void;
}

export function QuestionEditor({
  question,
  index,
  quizId,
  csrfToken,
  csrfTokenDelete,
  isDraft,
  isEditing,
  isDisabled,
  onEditStart,
  onEditEnd,
}: QuestionEditorProps) {
  const router = useRouter();
  const initialStateRef = useRef<EditorState>(initEditorState(question));

  const [editorState, setEditorState] = useState<EditorState>(() =>
    initEditorState(question)
  );
  const [dirtyLocales, setDirtyLocales] = useState<Set<AdminLocale>>(
    new Set()
  );
  const [activeLocale, setActiveLocale] = useState<AdminLocale>('en');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const isDirty = dirtyLocales.size > 0 || editorState.difficulty !== initialStateRef.current.difficulty;

    const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm('Delete this question? This cannot be undone.');
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/quiz/${quizId}/questions/${question.id}`,
        {
          method: 'DELETE',
          headers: { 'x-csrf-token': csrfTokenDelete ?? '' },
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? 'Failed to delete question');
        return;
      }

      router.refresh();
    } catch {
      alert('Network error');
    } finally {
      setDeleting(false);
    }
  }

  // Reset all edit state when entering edit mode.
  // question prop is stable (server-fetched at page load) so it's safe to omit from deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isEditing) {
      const initial = initEditorState(question);
      initialStateRef.current = initial;
      setEditorState(initial);
      setDirtyLocales(new Set());
      setSaveStatus('idle');
      setSaveError(null);
      setValidationError(null);
      setActiveLocale('en');
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing || !isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isEditing, isDirty]);


  function markLocaleDirty(locale: AdminLocale) {
    setDirtyLocales(prev => new Set(prev).add(locale));
  }

  function handleQuestionTextChange(locale: AdminLocale, text: string) {
    setEditorState(prev => ({
      ...prev,
      locales: {
        ...prev.locales,
        [locale]: { ...prev.locales[locale], questionText: text },
      },
    }));
    markLocaleDirty(locale);
  }

  function handleExplanationChange(locale: AdminLocale, blocks: AnswerBlock[]) {
    setEditorState(prev => ({
      ...prev,
      locales: {
        ...prev.locales,
        [locale]: { ...prev.locales[locale], explanation: blocks },
      },
    }));
    markLocaleDirty(locale);
  }

  function handleAnswerTextChange(
    answerId: string,
    locale: AdminLocale,
    text: string
  ) {
    setEditorState(prev => ({
      ...prev,
      answers: prev.answers.map(a =>
        a.id === answerId
          ? { ...a, translations: { ...a.translations, [locale]: text } }
          : a
      ),
    }));
    markLocaleDirty(locale);
  }

  // isCorrect is locale-independent — marks all 3 locales dirty so the save
  // includes updated isCorrect alongside all locale content upserts
  function handleCorrectChange(answerId: string) {
    setEditorState(prev => ({
      ...prev,
      answers: prev.answers.map(a => ({ ...a, isCorrect: a.id === answerId })),
    }));
    setDirtyLocales(new Set(ALL_LOCALES));
  }

  function handleDifficultyChange(value: Difficulty) {
    setEditorState(prev => ({ ...prev, difficulty: value }));
  }

  function handleCancel() {
    if (isDirty) {
      const confirmed = window.confirm('Discard unsaved changes?');
      if (!confirmed) return;
    }
    setEditorState(initialStateRef.current);
    setDirtyLocales(new Set());
    setSaveStatus('idle');
    setSaveError(null);
    setValidationError(null);
    onEditEnd();
  }

  async function handleSave() {
    // Skip locale validation for difficulty-only saves
    if (dirtyLocales.size > 0) {
      const error = validate(editorState);
      if (error) {
        setValidationError(error);
        return;
      }
    }
    setValidationError(null);

    if (dirtyLocales.size > 0 && dirtyLocales.size < 3) {
      const untouched = ALL_LOCALES.filter(l => !dirtyLocales.has(l))
        .map(l => l.toUpperCase())
        .join(', ');
      const modified = Array.from(dirtyLocales)
        .map(l => l.toUpperCase())
        .join(', ');
      const confirmed = window.confirm(
        `You only modified ${modified}. ${untouched} will be saved with existing content unchanged.\n\nAre you sure these translations don't need the same corrections?`
      );
      if (!confirmed) return;
    }

    setSaveStatus('saving');
    setSaveError(null);

    try {
      const body = {
        dirtyLocales: Array.from(dirtyLocales),
        difficulty: editorState.difficulty !== initialStateRef.current.difficulty
          ? editorState.difficulty
          : undefined,
        translations: {
          en: {
            questionText: editorState.locales.en.questionText,
            explanation: editorState.locales.en.explanation,
          },
          uk: {
            questionText: editorState.locales.uk.questionText,
            explanation: editorState.locales.uk.explanation,
          },
          pl: {
            questionText: editorState.locales.pl.questionText,
            explanation: editorState.locales.pl.explanation,
          },
        },
        answers: editorState.answers.map(a => ({
          id: a.id,
          isCorrect: a.isCorrect,
          translations: {
            en: { answerText: a.translations.en },
            uk: { answerText: a.translations.uk },
            pl: { answerText: a.translations.pl },
          },
        })),
      };

      const res = await fetch(
        `/api/admin/quiz/${quizId}/questions/${question.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const code = typeof json?.code === 'string' ? json.code : null;

        if (
          res.status === 403 &&
          (code === 'CSRF_MISSING' || code === 'CSRF_INVALID')
        ) {
          setSaveError('Session expired — please refresh the page.');
        } else {
          setSaveError(json?.error ?? 'Failed to save. Please try again.');
        }
        setSaveStatus('error');
        return;
      }

      setSaveStatus('saved');
      router.refresh();
      setTimeout(onEditEnd, 1500);
    } catch {
      setSaveError('Network error. Please try again.');
      setSaveStatus('error');
    }
  }

  const missingLocales = new Set(ALL_LOCALES.filter(l => !question.content[l]));
  const currentLocale = editorState.locales[activeLocale];

  // ── Row view ──

  if (!isEditing) {
    return (
      <div className="border-border flex items-center gap-3 rounded-lg border px-4 py-3">
        <span className="text-muted-foreground text-xs font-medium tabular-nums">
          Q{index + 1}
        </span>
        <span className="text-foreground flex-1 truncate text-sm">
          {question.content.en?.questionText ??
            question.content.uk?.questionText ??
            'Untitled question'}
        </span>
                <span className="text-muted-foreground shrink-0 text-xs">
          {question.difficulty}
        </span>
        {missingLocales.size > 0 && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
        )}
                <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onEditStart}
            disabled={isDisabled}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              isDisabled
                ? 'text-muted-foreground cursor-not-allowed opacity-40'
                : 'bg-muted text-foreground hover:bg-muted/70'
            )}
          >
            Edit
          </button>
          {isDraft && csrfTokenDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDisabled || deleting}
              className="rounded-md px-3 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-40"
            >
              {deleting ? '...' : 'Delete'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Edit view ──

  return (
    <div className="border-[var(--accent-primary)] rounded-lg border-2">
      <div className="border-border flex items-center gap-3 border-b px-4 py-3">
        <span className="text-muted-foreground text-xs font-medium tabular-nums">
          Q{index + 1}
        </span>
        <span className="text-foreground flex-1 truncate text-sm font-medium">
          {question.content.en?.questionText ??
            question.content.uk?.questionText ??
            'Untitled question'}
        </span>
        <span className="rounded-full bg-[var(--accent-primary)]/10 px-2 py-0.5 text-xs font-medium text-[var(--accent-primary)]">
          Editing
        </span>
      </div>

      <div className="space-y-4 px-4 py-4">
                <div>
          <label className="text-foreground mb-1 block text-xs font-medium">
            Difficulty
          </label>
          <select
            value={editorState.difficulty}
            onChange={e => handleDifficultyChange(e.target.value as Difficulty)}
            className="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm"
          >
            <option value="beginner">Beginner</option>
            <option value="medium">Medium</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
        <LocaleTabs
          active={activeLocale}
          onChange={setActiveLocale}
          missingLocales={missingLocales}
          dirtyLocales={dirtyLocales}
        />

        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">
            Question text
          </label>
          <textarea
            value={currentLocale.questionText}
            onChange={e =>
              handleQuestionTextChange(activeLocale, e.target.value)
            }
            rows={3}
            className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
          />
        </div>

        <div>
          <label className="text-foreground mb-2 block text-xs font-medium">
            Answers
          </label>
          <div className="space-y-2">
            {editorState.answers.map(answer => (
              <AnswerEditor
                key={answer.id}
                answerId={answer.id}
                displayOrder={answer.displayOrder}
                answerText={answer.translations[activeLocale]}
                isCorrect={answer.isCorrect}
                onTextChange={text =>
                  handleAnswerTextChange(answer.id, activeLocale, text)
                }
                onCorrectChange={() => handleCorrectChange(answer.id)}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">
            Explanation
          </label>
          <ExplanationEditor
            key={`${question.id}-${activeLocale}`}
            blocks={currentLocale.explanation}
            onChange={blocks => handleExplanationChange(activeLocale, blocks)}
          />
        </div>

        {validationError && (
          <p className="text-sm text-red-500">{validationError}</p>
        )}
        {saveStatus === 'error' && saveError && (
          <p className="text-sm text-red-500">{saveError}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={saveStatus === 'saving'}
            className="text-muted-foreground hover:text-foreground rounded-md px-4 py-2 text-sm transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveStatus === 'saving' || saveStatus === 'saved'}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50',
              saveStatus === 'saved'
                ? 'bg-emerald-500 text-white'
                : 'bg-[var(--accent-primary)] text-white hover:opacity-90'
            )}
          >
            {saveStatus === 'saving'
              ? 'Saving...'
              : saveStatus === 'saved'
                ? 'Saved'
                : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
