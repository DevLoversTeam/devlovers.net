'use client';

import { useState } from 'react';

import type { AdminQuizQuestion } from '@/db/queries/quizzes/admin-quiz';

import { QuestionEditor } from './QuestionEditor';

interface QuizEditorListProps {
  questions: AdminQuizQuestion[];
  quizId: string;
  csrfToken: string;
}

export function QuizEditorList({
  questions,
  quizId,
  csrfToken,
}: QuizEditorListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {questions.map((question, index) => (
        <QuestionEditor
          key={question.id}
          question={question}
          index={index}
          quizId={quizId}
          csrfToken={csrfToken}
          isEditing={editingId === question.id}
          isDisabled={editingId !== null && editingId !== question.id}
          onEditStart={() => setEditingId(question.id)}
          onEditEnd={() => setEditingId(null)}
        />
      ))}
    </div>
  );
}
