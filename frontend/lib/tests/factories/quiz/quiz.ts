
export interface MockQuestion {
  id: string;
  answers: Array<{
    id: string;
    isCorrect: boolean;
    answerText?: string;
  }>;
}

export interface MockQuizSession {
  status: 'rules' | 'in_progress' | 'completed';
  currentIndex: number;
  answers: Array<{
    questionId: string;
    selectedAnswerId: string;
    isCorrect: boolean;
    answeredAt: number;
  }>;
  questionStatus: 'answering' | 'revealed';
  selectedAnswerId: string | null;
  startedAt: number | null;
  savedAt: number;
}

let questionCounter = 0;

export function createMockQuestion(
  overrides?: Partial<MockQuestion>
): MockQuestion {
  questionCounter++;
  const qId = `q-${questionCounter}`;

  return {
    id: qId,
    answers: [
      { id: `${qId}-a1`, isCorrect: true, answerText: 'Correct answer' },
      { id: `${qId}-a2`, isCorrect: false, answerText: 'Wrong answer 1' },
      { id: `${qId}-a3`, isCorrect: false, answerText: 'Wrong answer 2' },
      { id: `${qId}-a4`, isCorrect: false, answerText: 'Wrong answer 3' },
    ],
    ...overrides,
  };
}

export function createMockQuestions(count: number): MockQuestion[] {
  return Array.from({ length: count }, () => createMockQuestion());
}

export function createMockQuizSession(
  overrides?: Partial<MockQuizSession>
): MockQuizSession {
  return {
    status: 'in_progress',
    currentIndex: 0,
    answers: [],
    questionStatus: 'answering',
    selectedAnswerId: null,
    startedAt: Date.now(),
    savedAt: Date.now(),
    ...overrides,
  };
}

export function createCorrectAnswersMap(
  questions: MockQuestion[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const q of questions) {
    const correct = q.answers.find(a => a.isCorrect);
    if (correct) {
      map[q.id] = correct.id;
    }
  }
  return map;
}

export function resetFactoryCounters(): void {
  questionCounter = 0;
}
