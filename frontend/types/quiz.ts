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
