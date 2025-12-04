 # DevLovers Project - Interview Preparation Platform

  ## Project Description
  DevLovers is a platform for technical interview preparation in frontend, backend,
  and full-stack development. It combines:
  - **Content System**: Sanity CMS for blog posts with categories and authors
  - **Interview Questions**: PostgreSQL database with structured Q&A (categories
  table)
  - **Quiz System**: Interactive quiz platform with anti-cheat, leaderboards (Phase
  0-1 ✅ completed)

  ---

  ## Architecture

  ### Monorepo Structure
  The project is organized as a monorepo with two main directories:
  - `frontend/` - Next.js 16 application with Drizzle ORM
  - `studio/` - Sanity Studio CMS

  ### Technology Stack

  #### Frontend (`/frontend`)
  - **Framework**: Next.js 16.0.1 with App Router
  - **Runtime**: React 19.2.0
  - **Styling**: Tailwind CSS v4, Geist fonts (sans & mono)
  - **Database**: Neon PostgreSQL with Drizzle ORM 0.44.7
  - **CMS Integration**: Sanity Client 7.12.1 with GROQ queries
  - **UI Components**: Radix UI (Accordion, Tabs, Radio Group), Lucide React icons
  - **Notifications**: Sonner (toast notifications)
  - **Image Handling**: Sanity Image URL builder
  - **Type Safety**: TypeScript 5
  - **Code Quality**: ESLint 9, Prettier

  #### Studio (`/studio`)
  - **CMS**: Sanity Studio 4.14.2
  - **Framework**: React 19.1
  - **Styling**: Styled Components 6.1.18
  - **Tooling**: Vision Tool (GROQ playground)
  - **Project ID**: 6y9ive6v
  - **Dataset**: production

  ---

  ## Directory Structure

  ```
  devlovers.net/
  ├── frontend/
  │   ├── app/                          # Next.js App Router
  │   │   ├── about/                    # About page
  │   │   ├── api/                      # API routes
  │   │   │   └── quiz/[slug]/          # ✅ NEW: Quiz API endpoint
  │   │   │       └── route.ts
  │   │   ├── contacts/                 # Contacts page
  │   │   ├── post/                     # Blog post pages
  │   │   ├── test-explanation/         # ✅ NEW: ExplanationRenderer test
  │   │   │   └── page.tsx
  │   │   ├── layout.tsx                # Root layout with header/footer
  │   │   ├── page.tsx                  # Home page (TabsSection)
  │   │   ├── globals.css               # Global styles
  │   │   └── not-found.tsx             # 404 page
  │   ├── components/
  │   │   ├── quiz/                     # ✅ Quiz components
  │   │   │   ├── ExplanationRenderer.tsx  # Renders explanation JSON blocks
  │   │   │   ├── QuizContainer.tsx     # Main quiz orchestrator
  │   │   │   ├── QuizQuestion.tsx      # Question display with answers
  │   │   │   ├── QuizProgress.tsx      # Progress indicator
  │   │   │   └── QuizResult.tsx        # Result screen
  │   │   ├── shared/                   # Shared business components
  │   │   │   ├── AccordionList.tsx
  │   │   │   └── TabsSection.tsx
  │   │   └── ui/                       # Reusable UI primitives
  │   │       ├── accordion.tsx
  │   │       ├── button.tsx            # ✅ NEW: Reusable button component
  │   │       ├── radio-group.tsx
  │   │       └── tabs.tsx
  │   ├── hooks/                        # ✅ NEW: Custom React hooks
  │   │   └── useAntiCheat.ts           # Anti-cheat violation tracking
  │   ├── db/                           # Database layer
  │   │   ├── schema/                   # ✅ UPDATED: Organized schemas
  │   │   │   ├── index.ts              # Exports all schemas
  │   │   │   ├── categories.ts         # Old tables (categories, questions)
  │   │   │   └── quiz.ts               # ✅ NEW: 8 quiz tables
  │   │   ├── queries/                  # ✅ NEW: Reusable query functions
  │   │   │   └── quiz.ts               # Quiz-related queries
  │   │   ├── index.ts                  # Database client
  │   │   ├── seed.ts                   # Old seed script
  │   │   ├── seedCategories.ts         # Category seeding
  │   │   ├── seed-quiz-react.ts        # ✅ NEW: Quiz seed (5 questions × 3 langs)
  │   │   └── verify-quiz-seed.ts       # ✅ NEW: Verification script
  │   ├── docs/                         # ✅ NEW: Quiz documentation
  │   │   ├── quiz-implementation-tasks.md  # Step-by-step implementation plan
  │   │   ├── quiz-system-research.md       # Full technical research
  │   │   ├── quiz-schema.dbml              # Database schema for dbdiagram.io
  │   │   ├── quiz-schema.mermaid           # ERD diagram
  │   │   └── QuizQuestion.jsx              # Component example
  │   ├── drizzle/                      # Drizzle migrations
  │   │   └── meta/                     # Migration metadata
  │   ├── lib/
  │   │   └── utils.ts                  # Utility functions (clsx, tailwind-merge)
  │   ├── public/                       # Static assets
  │   ├── drizzle.config.ts             # Drizzle Kit configuration
  │   ├── next.config.ts                # Next.js config (Sanity CDN images)
  │   └── package.json
  │
  ├── studio/
  │   ├── schemaTypes/                  # Sanity schema definitions
  │   │   ├── author.ts                 # Author content type
  │   │   ├── blockContent.ts           # Rich text content
  │   │   ├── category.ts               # Category content type
  │   │   ├── post.ts                   # Blog post content type
  │   │   └── index.ts                  # Schema exports
  │   ├── static/                       # Static assets for studio
  │   ├── sanity.config.ts              # Sanity configuration
  │   └── package.json
  │
  ├── CLAUDE.md                         # This file (project state + quiz progress)
  ├── .prettierrc                       # Prettier config (shared)
  ├── .gitignore                        # Git ignore rules
  ├── CODE_OF_CONDUCT.md                # Community guidelines
  ├── SECURITY.md                       # Security policy
  ├── LICENSE.txt                       # License information
  └── README.md                         # Basic project description
  ```

  ---

  ## Database Schema (Drizzle ORM)

  ### Old Tables (Interview Questions)

  **1. categories**
  - `id` (serial, primary key)
  - `name` (text, unique, not null)
  - Relations: One-to-many with questions

  **2. questions**
  - `id` (serial, primary key)
  - `question` (text, not null)
  - `answer_blocks` (jsonb, not null) - Stores structured answer content
  - `category_id` (integer, foreign key to categories)
  - Relations: Many-to-one with categories
  - Cascade deletion: Questions deleted when category is deleted

  **Database Configuration:**
  - **Provider**: Neon Database (serverless PostgreSQL)
  - **ORM**: Drizzle ORM with TypeScript
  - **Migrations**: Located in `frontend/drizzle/`
  - **Environment**: DATABASE_URL from `.env` file

  ---

  ### ✅ NEW: Quiz Tables (8 tables)

  | Table | Purpose | Key Fields |
  |-------|---------|------------|
  | `quizzes` | Quiz metadata | id (uuid), slug, questionsCount, timeLimitSeconds, 
  isActive |
  | `quiz_translations` | Quiz i18n | quizId, locale (pk), title, description |
  | `quiz_questions` | Questions | id (uuid), quizId, displayOrder, difficulty,
  sourceQuestionId (nullable) |
  | `quiz_question_content` | Question i18n | quizQuestionId, locale (pk),
  questionText, explanation (JSONB) |
  | `quiz_answers` | Answer options | id (uuid), quizQuestionId, displayOrder,
  isCorrect |
  | `quiz_answer_translations` | Answer i18n | quizAnswerId, locale (pk), answerText
  |
  | `quiz_attempts` | User results | id (uuid), userId, quizId, score, percentage,
  integrityScore |
  | `quiz_attempt_answers` | User answers | id (uuid), attemptId, quizQuestionId,
  selectedAnswerId, isCorrect |

  **Current Quiz Data:**
  - 1 quiz: "React Fundamentals" (slug: `react-fundamentals`)
  - 5 questions with 4 answers each
  - 3 languages: uk (українська), en (English), pl (Polski)

  **Key Architecture Decisions:**
  - Quizzes are separate entities (not reusing questions directly)
  - `source_question_id` in quiz_questions links to main questions (optional)
  - `integrity_score` (0-100) tracks anti-cheat violations
  - Composite primary keys for translations: (entity_id, locale)

  ---

  ## Sanity CMS Schema

  ### Content Types
  1. **Post** - Blog articles
     - title, slug, author (reference)
     - mainImage (with hotspot)
     - categories (array of references)
     - publishedAt (datetime)
     - body (array of blocks and images)

  2. **Author** - Content authors
     - (Schema defined in studio/schemaTypes/author.ts)

  3. **Category** - Content categorization
     - (Schema defined in studio/schemaTypes/category.ts)

  4. **Block Content** - Rich text content
     - (Schema defined in studio/schemaTypes/blockContent.ts)

  ---

  ## ✅ COMPLETED: Quiz System Phase 0-1

  ### Phase 0: Proof of Concept ✅
  **Completed Tasks:**
  - [x] Created 8 quiz tables in `db/schema/quiz.ts`
  - [x] Generated and applied migrations to Neon DB (`npx drizzle-kit push`)
  - [x] Created seed script: `db/seed-quiz-react.ts` (5 questions × 3 languages)
  - [x] Verified data in DBeaver (all 8 tables populated correctly)
  - [x] Created API endpoint: `GET /api/quiz/[slug]?locale=uk`
  - [x] Created `ExplanationRenderer` component for rendering quiz explanations
  - [x] Created test page `/test-explanation` to verify ExplanationRenderer

  **Test URLs:**
  http://localhost:3000/api/quiz/react-fundamentals?locale=uk
  http://localhost:3000/api/quiz/react-fundamentals?locale=en
  http://localhost:3000/api/quiz/react-fundamentals?locale=pl
  http://localhost:3000/test-explanation

  ### Phase 1: Database Queries ✅
  **Completed Tasks:**
  - [x] Created `db/queries/quiz.ts` with reusable query functions:
    - `getQuizBySlug(slug, locale)` - get quiz with translation for specific locale
    - `getQuizQuestions(quizId, locale)` - get questions with answers
    - `randomizeQuizQuestions(questions, seed)` - shuffle questions/answers with seed
    - `getQuizQuestionsRandomized(quizId, locale, seed)` - get randomized questions
    - `getQuizLeaderboard(quizId, limit)` - top scores (integrity >= 70)
    - `getUserBestAttempt(userId, quizId)` - user's best score
    - `getUserQuizHistory(userId, quizId)` - all user attempts
    - `getAttemptDetails(attemptId)` - attempt with answers
  - [x] Refactored API route `/api/quiz/[slug]/route.ts` to use query functions
    - Code reduced from 68 lines to 54 lines
    - Much cleaner and more maintainable

  ### Phase 2: Server Actions ✅
  **Completed Tasks:**
  - [x] Created `actions/quiz.ts` with `submitQuizAttempt` server action
  - [x] Validates answer submission (userId, quizId, answers required)
  - [x] Validates time spent (min 3 sec per question)
  - [x] Calculates score and percentage
  - [x] Calculates integrity_score from client violations (100 - violations × 10)
  - [x] Saves to quiz_attempts and quiz_attempt_answers tables
  - [x] Returns { success, attemptId, score, percentage, integrityScore }

  ### Phase 3: MVP Quiz UI ✅
  **Completed Tasks:**
  - [x] Installed `@radix-ui/react-radio-group` for accessible radio inputs
  - [x] Created `components/ui/radio-group.tsx` wrapper (Apple-style design)
  - [x] Created `components/quiz/QuizQuestion.tsx`:
    - Radio-style answer options with Radix UI
    - Correct/incorrect visual feedback (green/red borders)
    - ExplanationRenderer integration with fade-in animation
    - Motivational message for incorrect answers (orange block)
    - "Далі" button after answer
    - Props: question, status, selectedAnswerId, onAnswer, onNext, isLoading
  - [x] Created `components/quiz/QuizProgress.tsx`:
    - Circle indicators for each question (green/red/gray)
    - Current question highlighted with blue accent ring
    - Connecting lines between circles
    - Progress text "Питання X / Y"
    - Props: current, total, answers
  - [x] Created `components/quiz/QuizResult.tsx`:
    - Large score display (e.g., "3 / 5", "60%")
    - Animated progress bar (color-coded: red/orange/green)
    - Motivational messages based on score:
      - < 50%: "Потрібно більше практики" 📚
      - 50-79%: "Непоганий результат!" 💪
      - 80-100%: "Чудова робота!" 🎉
    - Action buttons: "Спробувати ще раз", "Повернутись до тем"
    - Props: score, total, percentage, onRestart, onBackToTopics
  - [x] Created `components/quiz/QuizContainer.tsx` (main orchestrator):
    - useReducer for complex state management
    - State: { status, currentIndex, answers, questionStatus, selectedAnswerId, startedAt }
    - Actions: ANSWER_SELECTED, NEXT_QUESTION, COMPLETE_QUIZ, RESTART
    - Orchestrates QuizProgress, QuizQuestion, QuizResult
    - Calls submitQuizAttempt server action on completion (useTransition)
    - Auto-submit on last question
    - Props: quizId, questions, userId
  - [x] Updated `app/quiz/[slug]/page.tsx`:
    - Integrated QuizContainer with real DB data
    - Server Component fetches quiz + randomized questions
    - Passes data to QuizContainer (Client Component)
    - Hardcoded userId: "test-user-123" (no auth yet)
  - [x] Added "Quiz" link to header navigation

  **Test URL:**
  http://localhost:3000/quiz/react-fundamentals

  **Features Working:**
  - Full quiz flow: answer questions → progress tracking → final result
  - Data saves to DB (quiz_attempts + quiz_attempt_answers tables)
  - Motivational messages based on performance
  - Restart quiz functionality
  - Apple-style flat design (no shadows, 1px borders, 12px radius)

  ---

  ## 🔄 NEXT: Quiz System Phase 4-7

  ### Phase 4: Anti-Cheat Hook ✅

  **Completed Tasks:**
  - [x] Installed Sonner toast library
  - [x] Created `hooks/useAntiCheat.ts`:
    - Prevents copy/paste (onCopy/onPaste preventDefault)
    - Prevents right-click context menu
    - Detects tab switches (document.visibilitychange)
    - Tracks violations array with timestamps
    - Shows toast warnings on violations (Sonner)
    - Returns: { violations, violationsCount, isTabActive, showWarning, resetViolations }
  - [x] Integrated `<Toaster />` in root layout (top-right position)
  - [x] Integrated useAntiCheat into QuizContainer:
    - Active only during 'in_progress' status
    - Passes violations to submitQuizAttempt
    - Resets violations on quiz restart
  - [x] Updated `actions/quiz.ts`:
    - Added 'paste' to ViolationEvent type
    - Stores violations in metadata
  - [x] Added Rules Screen before quiz start:
    - Explains quiz rules and anti-cheat system
    - Shows minimum time requirement (3 sec per question)
    - "Почати квіз" button starts the quiz
  - [x] Created `components/ui/button.tsx`:
    - Reusable button with 3 variants (primary, secondary, outline)
    - 3 sizes (sm, md, lg)
    - Used in QuizContainer, QuizResult, QuizQuestion
  - [x] Updated QuizResult:
    - Added violationsCount prop
    - Shows orange warning if violations >= 3
    - Message: "⚠️ Квіз завершено з порушеннями правил (N порушень). Результат не зараховано до рейтингу."
  - [x] Added `user-select: none` CSS for quiz content
  - [x] Updated QuizContainer state:
    - Added 'rules' status
    - startedAt is nullable (set on START_QUIZ action)
    - Restart returns to rules screen

  **Violations Handling (MVP - Soft Approach):**
  - 0-2 violations: Toast warnings, integrity_score reduced by 10% each
  - 3+ violations: integrity_score = 0 (not shown in leaderboard)
  - Quiz can be completed with any number of violations
  - QuizResult shows current progress + violation warning message

  ---

  **Future Enhancements (Post-MVP):**

  Auto-fail mechanism:
  - Option 1: Auto-submit after N violations (configurable per quiz)
  - Option 2: Score penalty per violation (e.g., -20% per tab switch)
  - Option 3: Hard limit (e.g., 3 strikes → immediate fail with score 0)

  Advanced detection:
  - DevTools detection (console.log intercept, debugger detection)
  - Mouse tracking (suspicious patterns, too fast selections)
  - Fullscreen API (require fullscreen mode during quiz)
  - Page visibility advanced tracking (blur/focus events)

  Visual deterrents:
  - Semi-transparent userId watermark across screen
  - Blur content when tab is inactive (document.hidden)
  - Screenshot detection via canvas fingerprinting
  - Camera/screen recording warning

  Quiz configuration (per quiz):
  - `allow_tab_switch` (boolean) - allow/disallow tab switching
  - `max_violations` (number) - auto-fail threshold
  - `require_fullscreen` (boolean) - enforce fullscreen mode
  - `violation_penalty` (number) - score reduction per violation

  Database schema updates (future):
  - Add `violation_details` JSONB to quiz_attempts (store violation types + timestamps)
  - Add anti-cheat config fields to quizzes table
  - Track violation patterns per user for anomaly detection

  ---
  ### Phase 5: Leaderboard Component

  File to create: components/quiz/Leaderboard.tsx (server component)

  Features:
  - Props: entries, currentUserId
  - Shows top 10 users (integrity >= 70)
  - Medal emojis for top 3 (🥇🥈🥉)
  - Highlighted row for current user (sticky)
  - Horizontal dividers
  - Anonymous userIds display (e.g., "User ***123")

  Integration:
  - Add to quiz page below QuizContainer
  - Fetch leaderboard with getQuizLeaderboard(quiz.id, 10)
  - Real-time updates after quiz completion

  ---
  ### Phase 6: Additional Features

  **Countdown Timer:**
  - Add to QuizContainer
  - Formula: questionsCount × 20 seconds
  - Display at top of quiz
  - Auto-submit when time expires
  - Visual warning at 60 seconds remaining

  **Quiz List Page:**
  - File: app/quiz/page.tsx
  - Display all available quizzes
  - Filter by topic/difficulty
  - Show completion status per user

  **Topics Integration:**
  - File: app/topics/[slug]/page.tsx (to be created)
  - Add "Пройти квіз" button linking to quiz
  - Show quiz completion badge if completed

  **Dashboard:**
  - File: app/dashboard/page.tsx (to be created)
  - Quiz statistics section:
    - Total quizzes completed
    - Average score
    - Recent attempts
    - Best scores per quiz
  - Progress charts
  - Achievements/badges

  ---
  ### Phase 7: Testing & Optimization

  **Unit Tests:**
  - __tests__/components/QuizQuestion.test.tsx
  - __tests__/components/QuizProgress.test.tsx
  - __tests__/components/QuizResult.test.tsx

  **Integration Tests:**
  - __tests__/quiz-flow.test.tsx
  - Full quiz completion flow
  - Score calculation verification
  - Server action integration

  **Performance:**
  - Code splitting for quiz components
  - Lazy loading questions
  - Optimistic UI updates
  - Image optimization for explanation content

  **Accessibility:**
  - Keyboard navigation testing
  - Screen reader compatibility
  - Focus management
  - ARIA labels verification

  ---
  Quiz System Architecture

  State Management

  // QuizContainer state (useReducer)
  {
    status: 'answering' | 'revealed' | 'completed',
    currentIndex: number,
    answers: {
      questionId: string,
      selectedAnswerId: string,
      isCorrect: boolean,
      answeredAt: Date
    }[],
    score: number
  }

  Anti-Cheat System

  Client-side (soft warnings):
  - Block copy/paste, context menu
  - Detect tab switches (visibilitychange)
  - Toast warnings on violations
  - Track violations in array

  Server-side (enforced):
  - Randomize questions/answers with seed
  - Validate min time per question (3 sec)
  - Calculate integrity_score (0-100) based on violations
  - Leaderboard filters by integrity_score >= 70

  Explanation Block Format (JSONB)

  Quiz explanations are stored as structured JSON blocks:

  type BlockType = 'paragraph' | 'numberedList' | 'bulletList' | 'code';

  interface AnswerBlock {
    type: BlockType;
    language?: string; // for code blocks (e.g., 'javascript')
    children: (TextNode | ListItemNode)[];
  }

  interface TextNode {
    text: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean; // inline code
  }

  interface ListItemNode {
    type: 'listItem';
    children: (TextNode | ListItemNode)[];
  }

  Example:
  [
    {
      "type": "paragraph",
      "children": [
        { "text": "React — це саме ", "bold": false },
        { "text": "бібліотека", "bold": true },
        { "text": ", а не фреймворк." }
      ]
    },
    {
      "type": "code",
      "language": "javascript",
      "children": [
        { "text": "const [count, setCount] = useState(0);" }
      ]
    }
  ]

  Renderer: components/quiz/ExplanationRenderer.tsx handles all block types:
  - paragraph → <p> with formatted text (bold, italic, inline code)
  - code → <pre><code> with dark background
  - numberedList → <ol><li>
  - bulletList → <ul><li>

  ---
  Design System (Apple-style)

  Colors

  Light mode:
    Background: #ffffff
    Text: #1d1d1f
    Accent: #007aff

  Dark mode:
    Background: #000000
    Text: #f5f5f7
    Accent: #0a84ff

  Styling Guidelines

  - No shadows (flat design)
  - 1px borders for outlines
  - 12px border radius for rounded corners
  - SF Pro / system fonts (Geist fonts in this project)
  - Minimalist - clean, simple, functional

  ---
  Key Features

  Frontend Features

  - Responsive Design: Tailwind CSS with mobile-first approach
  - Navigation: Header with Home, Blog, About, Contacts
  - Interview Prep: Tab-based interface with accordion lists for questions
  - Quiz System: Interactive quizzes with anti-cheat, leaderboards, multilingual
  - Blog System: Integration with Sanity CMS for blog posts
  - Image Optimization: Next.js Image component with Sanity CDN
  - Typography: Custom Geist font stack (sans + mono)

  Content Management

  - Sanity Studio: Dedicated CMS at /studio
  - GROQ Queries: Type-safe content fetching
  - Portable Text: Rich text rendering with @portabletext/react
  - Image URLs: Server-side image transformation via Sanity

  ---
  Scripts & Commands

  Frontend

  # Development
  npm run dev                        # Start Next.js dev server
  npm run build                      # Build for production
  npm run start                      # Start production server
  npm run lint                       # Run ESLint

  # Old seeding (categories + questions)
  npm run seed:categories            # Seed category data
  npm run seed                       # Run full database seed

  # Database (Drizzle)
  npx drizzle-kit generate           # Generate migrations
  npx drizzle-kit push               # Apply migrations to Neon DB
  npx drizzle-kit studio             # Open Drizzle Studio (GUI)

  # Quiz seeding
  npx tsx db/seed-quiz-react.ts      # Seed React quiz (5 questions × 3 langs)
  npx tsx db/verify-quiz-seed.ts     # Verify seed data

  Studio

  cd studio
  npm run dev                        # Start Sanity Studio dev server
  npm run build                      # Build Sanity Studio
  npm run deploy                     # Deploy studio to Sanity
  npm run deploy-graphql             # Deploy GraphQL API

  ---
  Configuration Files

  Prettier Configuration

  - Print width: 80 characters
  - Single quotes: true
  - Semicolons: enabled
  - ES5 trailing commas
  - Arrow function parens: avoid
  - Prose wrap: always

  Next.js Configuration

  - Remote image patterns: cdn.sanity.io/images/**

  TypeScript

  - Strict mode enabled (standard Next.js config)
  - Path aliases: @/ points to frontend root

  Drizzle Config

  // drizzle.config.ts
  {
    out: './drizzle',
    schema: './db/schema',  // Points to db/schema/ folder
    dialect: 'postgresql',
    dbCredentials: {
      url: process.env.DATABASE_URL
    }
  }

  ---
  Development Workflow

  Git Configuration

  - Main Branch: main (for PRs)
  - Current Branch: lesia-dev
  - Ignored Files: node_modules, .next, .env*, dist, .sanity, build outputs

  Recent Development

  1. Integrated Drizzle ORM with Neon database
  2. Configured database migrations and deployment
  3. Added Prettier configuration
  4. Created CODE_OF_CONDUCT.md and SECURITY.md
  5. Updated metadata and favicon
  6. Set up Sanity Studio
  7. ✅ NEW: Implemented Quiz System Phase 0-1

  ---
  Environment Variables

  Frontend (.env)

  DATABASE_URL=postgresql://...     # Neon database connection string

  Studio

  - Sanity project ID: 6y9ive6v
  - Dataset: production

  ---
  Deployment

  Frontend

  - Likely deployed on Vercel (Next.js native platform)
  - Database hosted on Neon (serverless PostgreSQL)
  - Static assets served via Next.js

  Studio

  - Deployed to Sanity hosting (npm run deploy)
  - GraphQL API available via Sanity CDN

  ---
  Notes for Claude Code

  Component Development Rule

  IMPORTANT: Never create UI components "blindly" without visual verification.

  When creating a new component:
  1. Ask where to add the component for visualization
  2. Options:
     - Add to existing page where it will be used
     - Create test page if needed (e.g., app/test-[component]/page.tsx)
     - Integrate into main flow immediately
  3. Always provide mock data to test all component states
  4. User must see the component working before moving to next task

  When Adding Features

  1. Database Changes:
  - Update schemas in frontend/db/schema/
  - Run npx drizzle-kit generate to create migrations
  - Run npx drizzle-kit push to apply migrations
  - Test with Drizzle Studio (npx drizzle-kit studio)

  2. Content Types (Sanity):
  - Add new schema types in studio/schemaTypes/
  - Export from studio/schemaTypes/index.ts
  - Deploy studio after schema changes (npm run deploy)

  3. UI Components:
  - Use Radix UI primitives for accessible components
  - Place reusable UI in frontend/components/ui/
  - Place business logic components in frontend/components/shared/
  - Quiz components go in frontend/components/quiz/

  4. Styling:
  - Follow Tailwind CSS v4 conventions
  - Use Geist fonts (sans for body, mono for code)
  - Maintain consistent spacing with max-w-5xl container
  - Apple-style: no shadows, 1px borders, 12px radius

  5. Type Safety:
  - Leverage Drizzle ORM for database type inference
  - Use TypeScript for all new files
  - Enable strict mode compliance

  Code Style

  - Follow Prettier configuration (auto-formatted)
  - Use functional components with hooks
  - Prefer server components (Next.js App Router default)
  - Use async/await for data fetching
  - Use useTransition for server actions

  Testing Strategy

  - Currently no test framework configured
  - Phase 7 will add Jest + React Testing Library

  Performance Considerations

  - Use Next.js Image component for all images
  - Leverage server components for data fetching
  - Implement pagination for large lists
  - Use Sanity CDN for optimized image delivery

  ---
  🚀 Continue Development

  To resume Quiz System Phase 5:
  "Continue with Phase 5: Leaderboard Component from CLAUDE.md"

  Next steps:
  1. Create components/quiz/Leaderboard.tsx (server component)
  2. Add to quiz/[slug]/page.tsx below QuizContainer
  3. Fetch leaderboard data with getQuizLeaderboard
  4. Test leaderboard display and user highlighting

  ---
  📊 Quiz System Progress Tracker

  - Phase 0: Proof of Concept (✅ Completed)
    - Database schema, migrations, seed, API, ExplanationRenderer, test page
  - Phase 1: Database Queries (✅ Completed)
    - Query functions in db/queries/quiz.ts, refactored API route
  - Phase 2: Server Actions (✅ Completed)
    - actions/quiz.ts with submitQuizAttempt function
  - Phase 3: MVP Quiz UI (✅ Completed)
    - QuizQuestion.tsx, QuizProgress.tsx, QuizResult.tsx, QuizContainer.tsx
    - Full quiz flow working with DB integration
    - Added "Quiz" link to header
  - Phase 4: Anti-Cheat Hook (✅ Completed)
    - useAntiCheat hook with violation tracking
    - Sonner toast notifications
    - Rules Screen before quiz start
    - Button component (reusable UI)
    - user-select: none CSS
  - Phase 5: Leaderboard Component (NEXT)
    - File: components/quiz/Leaderboard.tsx
  - Phase 6: Additional Features
    - Countdown timer, quiz list page, topics integration, dashboard
  - Phase 7: Testing & Optimization
    - Unit tests, integration tests, performance, accessibility

  Current State: Phase 4 completed, ready for Phase 5 (Leaderboard Component)
  Next File to Create: components/quiz/Leaderboard.tsx

  ---
  License & Community

  - License: Project uses a custom license (see LICENSE.txt)
  - Studio: UNLICENSED (private)
  - Code of Conduct: Available in CODE_OF_CONDUCT.md
  - Security Policy: Available in SECURITY.md
  - Issues: Report via GitHub (TBD)

  ---
  Reference Documentation

  All quiz system documentation is in frontend/docs/:
  - quiz-implementation-tasks.md - Full step-by-step implementation plan
  - quiz-system-research.md - Technical research and decisions
  - quiz-schema.dbml - Database schema for dbdiagram.io
  - quiz-schema.mermaid - ERD diagram
  - QuizQuestion.jsx - Component example

  ---
  Last Updated: Phase 0-4 completed (MVP Quiz System + Anti-Cheat), ready for Phase 5
  Maintained By: Claude Code AI Assistant + Lesia (Developer)

  ---
