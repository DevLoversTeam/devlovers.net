# Quiz System Implementation Tasks

## Phase 0: Test Multilingual Quiz Seed (Proof of Concept)

### Task 0.1: Verify schema and run seed
```
1. Ensure db/schema/quiz.ts exists with all quiz tables
2. Run migrations: npx drizzle-kit push
3. Run seed: npx tsx scripts/seed-quiz-react.ts
4. Verify data in database
```

### Task 0.2: Create verification queries
```
Create file: scripts/verify-quiz-seed.ts

Queries to run:
- Count quizzes, quiz_translations
- Count quiz_questions, quiz_question_content per locale
- Count quiz_answers, quiz_answer_translations per locale
- Fetch one complete question with all translations
- Log sample explanation JSON structure
```

### Task 0.3: Create API endpoint for testing
```
Create file: app/api/quiz/[slug]/route.ts

GET /api/quiz/react-fundamentals?locale=uk

Response shape:
{
  quiz: { id, slug, title, description },
  questions: [
    {
      id, number, text, difficulty,
      answers: [{ id, text, isCorrect }],
      explanation: [...blocks...]
    }
  ]
}

Test with all 3 locales: uk, en, de
```

### Task 0.4: Render explanation blocks
```
Create file: components/quiz/ExplanationRenderer.tsx

Props: { blocks: AnswerBlock[] }

Handles:
- paragraph → <p>
- numberedList → <ol><li>
- bulletList → <ul><li>
- code → <pre><code> with syntax highlighting
- bold/italic/code inline styles
```

---

## Phase 1: Database Schema

### Task 1.1: Create Drizzle schema for quiz tables
```
Create file: db/schema/quiz.ts

Tables to create:
- quizzes (id, topic_id FK, slug, display_order, questions_count, time_limit_seconds, is_active, timestamps)
- quiz_translations (quiz_id PK, locale PK, title, description)
- quiz_questions (id, quiz_id FK, display_order, source_question_id FK nullable, difficulty)
- quiz_question_content (quiz_question_id PK, locale PK, question_text, explanation JSONB)
- quiz_answers (id, quiz_question_id FK, display_order, is_correct)
- quiz_answer_translations (quiz_answer_id PK, locale PK, answer_text)
- quiz_attempts (id, user_id FK, quiz_id FK, score, total_questions, percentage, time_spent_seconds, integrity_score, metadata JSONB, timestamps)
- quiz_attempt_answers (id, attempt_id FK, quiz_question_id FK, selected_answer_id FK nullable, is_correct, answered_at)

Reference: /docs/quiz-schema.dbml
```

### Task 1.2: Generate and run migrations
```
Commands:
npx drizzle-kit generate
npx drizzle-kit push
```

### Task 1.3: Create seed script with sample quiz
```
Create file: scripts/seed-quiz.ts

Sample data:
- 1 quiz linked to existing Python topic
- 5 questions with 4 answers each
- Translations for uk, en
```

---

## Phase 2: Database Queries

### Task 2.1: Create quiz queries
```
Create file: db/queries/quiz.ts

Functions:
- getQuizBySlug(slug: string, locale: string) - returns quiz with translations
- getQuizQuestionsRandomized(quizId: string, locale: string, seed?: number) - returns shuffled questions with answers
- getQuizLeaderboard(quizId: string, limit: number) - returns top scores with integrity_score >= 70
- getUserBestAttempt(userId: string, quizId: string) - returns user's best score
- getUserQuizHistory(userId: string, quizId: string) - returns all attempts
```

### Task 2.2: Create quiz mutations
```
Add to: db/queries/quiz.ts

Functions:
- createQuizAttempt(data: QuizAttemptInput) - creates attempt with answers in transaction
- updateUserProgressFromQuiz(userId: string, attemptId: string) - updates user_progress for related questions
```

---

## Phase 3: Server Actions

### Task 3.1: Create quiz actions
```
Create file: actions/quiz.ts

Actions:
- submitQuizAttempt(input: SubmitQuizAttemptInput) - validates answers, calculates score, saves to DB
  - Validates time (min 3 sec per question)
  - Calculates integrity_score from violations
  - Returns { success, attemptId, score, integrityScore }
```

---

## Phase 4: Components

### Task 4.1: Create anti-cheat hook
```
Create file: hooks/useAntiCheat.ts

Features:
- Prevent copy (e.preventDefault on copy event)
- Prevent context menu
- Detect tab switch (visibilitychange event)
- Track violations array
- Show warning toast on violation

Returns: { violations, isTabActive, showWarning }
```

### Task 4.2: Create QuizQuestion component
```
Create file: components/quiz/QuizQuestion.tsx

Props:
- question: { id, number, text, answers: { id, text, isCorrect }[], explanation }
- status: 'answering' | 'revealed'
- selectedAnswerId?: string
- onAnswer: (answerId: string) => void
- onNext: () => void
- isLoading?: boolean

Features:
- Radio-style answer selection
- Correct/incorrect visual feedback after answer
- Explanation block with fade-in animation
- Next button appears after answer
- Prevent double-click with isLocked state

Styles: Apple-style (no shadows, 1px borders, accent color #007aff)
```

### Task 4.3: Create QuizProgress component
```
Create file: components/quiz/QuizProgress.tsx

Props:
- current: number
- total: number
- answers: { isCorrect: boolean }[]

Features:
- Circle indicators for each question
- Color based on correctness (green/red)
- Current question highlighted with accent ring
- Connecting lines between circles
```

### Task 4.4: Create QuizResult component
```
Create file: components/quiz/QuizResult.tsx

Props:
- score: number
- total: number
- percentage: number
- previousBest?: number
- rank?: number
- totalParticipants?: number
- onRestart: () => void
- onViewAnswers: () => void

Features:
- Large score display
- Progress bar visualization
- Rank card (if available)
- Action buttons: restart, view answers, back to topic
```

### Task 4.5: Create QuizContainer component
```
Create file: components/quiz/QuizContainer.tsx

Props:
- quiz: Quiz
- questions: QuizQuestionWithAnswers[]
- userId?: string
- previousBest?: number

Features:
- useReducer for state management (status, currentIndex, answers, score)
- useAntiCheat integration
- useTransition for submit
- Orchestrates QuizProgress, QuizQuestion, QuizResult
- Calls submitQuizAttempt server action on completion
```

### Task 4.6: Create Leaderboard component
```
Create file: components/quiz/Leaderboard.tsx

Props:
- entries: { rank, name, percentage, attemptsCount }[]
- currentUserId?: string

Features:
- Server Component (no client interactivity)
- Medal emojis for top 3
- Highlighted row for current user (sticky)
- Horizontal dividers
```

---

## Phase 5: Pages

### Task 5.1: Create quiz page
```
Create file: app/[locale]/quiz/[slug]/page.tsx

Server Component:
- Fetch quiz with getQuizBySlug
- Fetch questions with getQuizQuestionsRandomized
- Fetch leaderboard with getQuizLeaderboard
- Fetch user's best attempt (if logged in)
- Render QuizContainer + Leaderboard

Metadata:
- Dynamic title from quiz.title
- Description from quiz.description
```

### Task 5.2: Create quiz list page (optional)
```
Create file: app/[locale]/quizzes/page.tsx

Features:
- List all active quizzes grouped by topic
- Show user's best score for each (if logged in)
- Link to individual quiz pages
```

---

## Phase 6: Integration

### Task 6.1: Add quiz link to topic page
```
Modify: app/[locale]/topics/[slug]/page.tsx

Add:
- Check if topic has associated quiz
- Show "Пройти квіз" button linking to /[locale]/quiz/[quiz-slug]
```

### Task 6.2: Update user dashboard
```
Modify: app/[locale]/dashboard/page.tsx (or wherever user stats are shown)

Add:
- Quiz statistics section
- Total quizzes completed
- Average score
- Recent quiz attempts
```

---

## Phase 7: Testing

### Task 7.1: Create component tests
```
Create file: __tests__/components/QuizQuestion.test.tsx

Tests:
- Renders question text and all answers
- Calls onAnswer with correct answerId on click
- Disables answers after selection (status = 'revealed')
- Shows explanation when revealed
- Shows correct answer indicator
```

### Task 7.2: Create integration tests
```
Create file: __tests__/quiz-flow.test.tsx

Tests:
- Complete quiz flow from start to result
- Score calculation is correct
- Server action is called with correct data
- Leaderboard updates after submission
```

---

## Execution Order

1. Phase 1 (DB) → 2 (Queries) → 3 (Actions) — backend foundation
2. Phase 4.1-4.4 (Components) — UI building blocks
3. Phase 4.5-4.6 + Phase 5 — assembly and pages
4. Phase 6 (Integration) — connect to existing app
5. Phase 7 (Testing) — verify everything works

---

## Commands for Claude Code

Start implementation:
```
Read /docs/quiz-system-research.md for full context, then implement Task 1.1
```

Continue:
```
Continue with Task 1.2
```

Specific task:
```
Implement Task 4.2 (QuizQuestion component) following the Apple-style design from the research doc
```

Review:
```
Review the quiz implementation against /docs/quiz-system-research.md and identify any missing features
```
