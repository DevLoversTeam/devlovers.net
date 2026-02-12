export interface QuizQuestion {
  id: string;
  displayOrder: number;
  difficulty: string | null;
  questionText: string | null;
  explanation: any;
}

export interface QuizAnswer {
  id: string;
  displayOrder: number;
  isCorrect: boolean;
  answerText: string | null;
}

export interface QuizQuestionWithAnswers extends QuizQuestion {
  answers: QuizAnswer[];
}

export interface UserLastAttempt {
  attemptId: string;
  quizId: string;
  quizSlug: string;
  quizTitle: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  score: number;
  totalQuestions: number;
  percentage: number;
  pointsEarned: number;
  integrityScore: number | null;
  completedAt: Date;
}
