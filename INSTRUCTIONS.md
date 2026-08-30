# DevLovers User Guide

This guide covers everyday use of DevLovers: preparing for technical interviews with Q&A and quizzes, saving learning progress, using the personal dashboard, browsing the leaderboard and blog, and placing orders in the shop.

> DevLovers is an open-source, multilingual learning platform for developers. The production version is available at [devlovers.net](https://devlovers.net). See [`README.md`](./README.md) for a feature overview and technical information. Security issues must be reported according to [`SECURITY.md`](./SECURITY.md).

## Contents

1. [What DevLovers is](#1-what-devlovers-is)
2. [Getting started](#2-getting-started)
3. [Access and navigation](#3-access-and-navigation)
4. [Questions and Answers](#4-questions-and-answers)
5. [AI Term Helper](#5-ai-term-helper)
6. [Quizzes](#6-quizzes)
7. [Personal dashboard](#7-personal-dashboard)
8. [Leaderboard and achievements](#8-leaderboard-and-achievements)
9. [Blog](#9-blog)
10. [Shop](#10-shop)
11. [Recommended learning workflow](#11-recommended-learning-workflow)
12. [Language, theme, cookies, and session](#12-language-theme-cookies-and-session)
13. [Frequently asked questions](#13-frequently-asked-questions)

---

## 1. What DevLovers is

DevLovers helps developers prepare for technical interviews in a structured way. Its main learning tools include:

- curated technical questions and answers organized by technology;
- tracking for viewed and bookmarked questions;
- topic-based quizzes with timers and explanations;
- a personal dashboard with statistics, history, and achievements;
- a community leaderboard;
- a technical blog;
- the DevLovers merchandise shop.

The interface and available content support three languages: English, Ukrainian, and Polish.

### Main sections

| Section | URL | Purpose |
|---|---|---|
| Home | `/` | Platform overview and quick access to learning tools |
| Q&A | `/q&a` | Technical interview questions and answers |
| Quizzes | `/quizzes` | Knowledge checks and topic practice |
| Leaderboard | `/leaderboard` | Community scores and rankings |
| Dashboard | `/dashboard` | Personal progress and profile settings |
| Blog | `/blog` | Technical articles and collections |
| Shop | `/shop` | Merchandise catalog, cart, and orders |
| About | `/about` | The mission, values, and DevLovers community |

Every page URL includes a language code, for example `/en/q&a`, `/uk/quizzes`, or `/pl/blog`. When you change the language, DevLovers keeps you in the same section whenever a corresponding localized page is available.

---

## 2. Getting started

### Using DevLovers without an account

As a guest, you can:

- browse Q&A, the blog, the leaderboard, and other public pages;
- open answers and move through paginated question lists;
- take quizzes in guest mode;
- browse products, add items to the cart, and use guest checkout when checkout is available.

Without an account, Q&A progress and bookmarks are not saved to a dashboard. After you open your first answer, DevLovers will invite you to sign in or continue without saving.

### Creating an account

**URL:** `/signup`

1. Enter your name and a valid email address.
2. Create a password of at least 8 characters. It must contain at least one uppercase letter and one special character.
3. Confirm the password and select **Sign up**.
4. Open the email from DevLovers and verify your address.
5. After verification, go to the login page.

The maximum password length is 72 bytes. Do not reuse a password from another service.

If Google or GitHub buttons are available on the page, you can create an account through that provider. OAuth availability depends on the current environment configuration.

### Signing in

**URL:** `/login`

Sign in with your email and password or an available OAuth provider. If you arrived from Q&A, a quiz result, or the orders page, DevLovers returns you to the relevant section after authentication.

If your email has not been verified, use the option to resend the verification email.

### Resetting your password

1. Select **Forgot password?** on `/login`.
2. Enter your email address and submit the request.
3. Open the reset link from the email.
4. Set a new password that meets the requirements shown in the form.

Password reset links expire. If a link is no longer valid, submit a new request at `/forgot-password`.

### Recommended first session

1. Create an account and verify your email.
2. Open **Q&A** and select a technology you want to study.
3. Read several answers and bookmark the questions you find difficult.
4. Take a quiz in the same topic.
5. Open your **Dashboard** to review your progress, mistakes, and suggested next action.

---

## 3. Access and navigation

DevLovers has three main access levels:

| Access level | Main capabilities |
|---|---|
| Guest | Browse public content, take guest quizzes, and use guest checkout |
| Registered user | Save Q&A progress, bookmarks, quiz results, points, achievements, explained terms, and account orders |
| Administrator | Manage learning content, the blog, shop products, and orders through administrative sections |

Permissions are checked by the server even when a link or button is not visible in the interface. If you cannot see an administration link, your account does not have the required role or the feature is disabled in the current environment.

### Main navigation

The platform navigation includes Q&A, Quizzes, Leaderboard, About, Blog, and Shop. The blog and shop use their own contextual navigation to provide quicker access to categories, products, the cart, and orders.

On mobile devices, the main links and account actions are available from the menu. The cart icon displays the number of items currently in your cart.

---

## 4. Questions and Answers

**URL:** `/q&a`

The Q&A section contains technical interview questions organized by technology. Topics include Git, HTML, CSS, JavaScript, TypeScript, React, Next.js, Vue.js, Angular, Node.js, SQL, PostgreSQL, MongoDB, Python, Django, Docker, Kubernetes, AWS, Azure, DevOps, mobile development, and backend technologies. New topics may be added over time.

### Working through questions

1. Select a technology from the topic bar.
2. Select a question to expand its answer.
3. Study the answer, then close it or continue to the next question.
4. Use the page-size control and pagination to move through longer lists.

For signed-in users, opening an answer for the first time automatically marks the question as **Viewed**. The counter and progress bar show how many questions you have completed in the current topic.

### Bookmarks

After signing in, a bookmark icon is available next to every question:

- select it once to save the question;
- select it again to remove the question from your bookmarks;
- the **Saved** counter shows the number of bookmarks in the current topic.

Bookmarks are stored in the database for your account. They remain available after you sign in again and when you use another device.

### Filters

Signed-in users can switch between two views:

- **All questions** — the complete list for the current topic;
- **Saved** — only questions bookmarked in the current topic.

The selected topic, page, page size, filter, and focused question are reflected in the URL. You can save the link and return to the same context later. Bookmarks remain private: another user who opens the same URL sees their own saved state, not yours.

If a topic has no bookmarks, an empty state explains how to save a question and provides an action to return to all questions.

### Resetting progress

The **Reset progress** button is available to signed-in users when the current topic contains viewed questions.

1. Select **Reset progress**.
2. Review the topic name and the number of viewed and bookmarked questions in the confirmation dialog.
3. Select **Reset progress** to confirm, or **Cancel** to keep the current state.

Resetting clears only the **Viewed** status in the current topic. All bookmarks remain saved. A confirmed reset cannot be undone.

### Synchronization and errors

Changes appear in the interface immediately and are then confirmed by the server. If saving fails, DevLovers restores the previous state and displays a message with a **Try again** action.

When you return to the browser tab, progress is refreshed from the server. This keeps the page synchronized with changes made in another tab or on another device.

### Guest mode

After opening the first answer, a guest sees a short explanation of the benefits of an account. Two actions are available:

- **Log in to save progress** — open the login page and return to Q&A afterward;
- **Continue without saving** — close the prompt and keep reading.

Questions opened before signing in are not automatically added to your saved Q&A progress. Sign in before studying if you want every opened question to be tracked.

---

## 5. AI Term Helper

You can select an unfamiliar word or short technical term inside a Q&A answer to request an AI-generated explanation.

### How to use it

1. Expand an answer in Q&A.
2. Select a term of at least two characters.
3. Open the AI helper from the action that appears.
4. Read the explanation and example in the context of the current question.

A request cannot exceed 100 characters. Explanations may be cached temporarily so that reopening the same term is faster.

For signed-in users, explained terms are saved to the dashboard. Guests are prompted to sign in or create an account. AI generation is subject to service availability and usage limits; if a temporary error occurs, try again later.

AI explanations are learning aids. For production decisions or other critical technical work, verify the information against the official documentation for the relevant technology.

---

## 6. Quizzes

**URL:** `/quizzes`

Quizzes help you check your knowledge after studying Q&A. They are grouped by the same technology topics. A quiz card shows its title, description, number of questions, time limit, and, when you are signed in, your best score and number of attempts.

### Before starting

1. Select a category and a quiz.
2. Check the number of questions and available time.
3. Read the quiz rules.
4. Select **Start quiz**.

Each question has one correct answer. After you choose an option, DevLovers shows whether it was correct, provides an explanation, and then allows you to continue.

### Timer and completion

The timer runs throughout the quiz. If time expires before you answer every question, the attempt is marked as incomplete and does not count as a completed result.

If you try to leave an active quiz, DevLovers asks for confirmation. Confirming the exit discards the current attempt. The page may restore in-progress state after an ordinary browser reload, but browser storage should not be treated as permanent result history.

### Integrity controls

During an active quiz, the system can record:

- copying and pasting;
- opening the context menu;
- switching to another tab or application;
- other actions listed in the rules for the quiz.

For registered users, a completed result is saved to the dashboard even when violations are recorded. Four or more violations prevent the attempt from awarding leaderboard points.

### Results

After completion, the result screen shows:

- correct answers and accuracy;
- integrity score and number of violations;
- points awarded;
- a learning status: Study, Review, or Mastered.

Points are based on improvement, not on repeatedly submitting the same score. If a new attempt does not improve your previous result, it may award no additional points.

Signed-in users can open the answer review. It shows their selected answer, the correct answer, and an explanation for each mistake.

### Taking a quiz as a guest

Guests can complete quizzes, but results are not added to permanent history or the leaderboard immediately. After completion, DevLovers offers sign-in and sign-up actions. If you authenticate through this flow, the prepared result may be transferred to your dashboard.

For reliable result tracking, sign in before starting a quiz.

---

## 7. Personal dashboard

**URL:** `/dashboard`

The dashboard is available only after sign-in. It is the central view of your personal learning progress.

### Profile

The profile card shows:

- your name, email, role, and join date;
- total points;
- quizzes taken;
- global leaderboard position;
- current activity streak.

Profile settings allow you to change your name and password. Changing a password requires your current password. Accounts created through an OAuth provider may have different limitations depending on the sign-in method.

### Quiz statistics

The dashboard shows total attempts, average accuracy, total points, last activity, and the trend in recent results. The activity heatmap highlights days on which you took quizzes.

The current streak is calculated from calendar days with quiz attempts. Reading Q&A does not currently extend the streak.

### Quiz results

The latest relevant attempt for each quiz displays:

- correct answers out of the total;
- accuracy;
- integrity score;
- points awarded;
- date;
- a Study, Review, or Mastered status.

Open a result to view its details and review mistakes when that action is available.

### Q&A progress

The learning-progress section lists topics in which you have activity. Each topic shows:

- viewed questions out of the total;
- completion percentage;
- bookmark count;
- an action to continue from the last opened question;
- a direct link to the saved questions in that topic.

If you do not have Q&A progress yet, the dashboard provides an action to start learning.

### Achievements, explained terms, and feedback

The dashboard also includes:

- unlocked and upcoming achievements;
- terms saved by the AI Term Helper;
- a feedback form for reporting an issue or sharing a suggestion;
- a link to support the open-source project through GitHub Sponsors.

Never send passwords, cookies, payment details, or other secrets through the feedback form.

---

## 8. Leaderboard and achievements

**URL:** `/leaderboard`

The leaderboard lists participants with awarded points. The top three are displayed separately, followed by a table with the remaining rankings and context for the current user.

### What affects your position

- accuracy in completed quizzes;
- score improvements over previous attempts;
- compliance with quiz integrity rules;
- total awarded points.

Four or more violations in a quiz disqualify the attempt from earning points, although the result remains in personal history.

### Achievements

Achievements are unlocked through learning activity, accuracy, result streaks, attempt milestones, and community participation. Some badges are connected to GitHub Sponsors support or starring the GitHub repository.

External achievements depend on DevLovers being able to match your GitHub identity with your platform profile. Updates may not appear immediately.

---

## 9. Blog

**URL:** `/blog`

The blog contains technical articles in English, Ukrainian, and Polish. Available features include:

- a featured or recent article;
- full-text search;
- category and tag filtering;
- pagination;
- author pages and article collections;
- recommended reading after an article.

The availability of a specific article in a particular language depends on whether that translation has been published. If search and filters return no results, remove active tags or return to **All** categories.

Articles may contain links to third-party resources that DevLovers does not control. Check the destination address before entering any personal information.

---

## 10. Shop

**URL:** `/shop`

The shop offers DevLovers merchandise. Product, payment, and delivery availability depends on the current environment and inventory.

### Product catalog

At `/shop/products`, you can:

- search for products;
- filter by available product attributes;
- change the sorting order;
- open a product page with its gallery, description, and size guide;
- select a variant or size and add it to the cart;
- load more products without returning to the beginning of the catalog.

Before adding an item, check the selected variant, price, and current availability.

### Cart

**URL:** `/shop/cart`

The cart allows you to change item quantities or remove products. The summary shows the merchandise subtotal; delivery is calculated during checkout when shipping is enabled.

The cart is stored in the browser. During checkout, the server checks products, prices, and inventory again. If anything has changed, update the cart as instructed before attempting payment.

### Checkout and payment

Checkout supports both registered users and guest orders. The form may request contact and shipping details. When Nova Poshta delivery is available, warehouse, parcel-locker, or courier options depend on the current configuration and address.

Available payment methods may include:

- card payment through Stripe;
- a Monobank invoice;
- Google Pay through Monobank on supported devices.

Only methods available for the current environment and currency are displayed. Monobank is available only for UAH checkout. Before confirming an order, verify your contact information, items, shipping details, and final total.

Avoid repeatedly refreshing the page while a payment is being processed. If the result is unclear, check the confirmation page or order history before attempting another payment.

### My orders

**URL:** `/shop/orders`

This page is available after sign-in and lists up to 50 recent orders with their date, total, item count, and payment status. The order details page includes items, payment provider, shipping address, and delivery status.

A guest order may not appear in your account history even if you later use an account with the same email. Keep the confirmation link or order number provided after checkout.

Returns and refunds depend on the order state and current policy. Review the delivery, payment, and returns pages linked from the site footer before submitting a request.

---

## 11. Recommended learning workflow

### Starting a new topic

1. Open Q&A and select the relevant technology.
2. Work through the questions in order, expanding each answer.
3. Bookmark questions that require more review.
4. Select unfamiliar terms and use the AI Term Helper.
5. After studying a block of theory, take a quiz in the same category.
6. Review incorrect answers from the dashboard.
7. Return to saved Q&A and revisit the difficult concepts.

### Short daily session

1. Open your **Dashboard**.
2. In Q&A progress, select **Continue** for your most recent topic.
3. Study 5–10 questions.
4. Review your bookmarks.
5. Complete one quiz or improve a previous result.
6. Check your streak, points, and next topic to review.

### Before an interview

1. Filter saved questions for the technologies relevant to the role.
2. Take the corresponding quizzes without switching to other tabs.
3. Focus on topics marked Study or Review in the dashboard.
4. Revisit all mistakes and saved AI explanations.
5. Retake a quiz after working through weak areas.

---

## 12. Language, theme, cookies, and session

### Language

The language switcher supports English, Ukrainian, and Polish. The language code appears in the URL. Technology names, brands, and payment-provider names may remain unchanged across languages.

### Theme

DevLovers supports light and dark themes. The selection is stored in your browser. You may need to choose it again on a new device or after clearing site data.

### Cookies and local data

Cookies are used for sessions and essential site behavior. Some temporary data—such as the cart, in-progress browser quiz state, or theme preference—may be stored locally.

Persistent Q&A progress, bookmarks, authenticated quiz results, points, and dashboard data are stored on the server for your account rather than only in local storage.

### Ending your session

Select **Log out** from the account menu when you finish using DevLovers on a shared device. If your session expires or is revoked, the platform may ask you to sign in again.

Logging out may not remove the local cart or all browser-level preferences. On a shared computer, use a private browsing window and close every tab when you finish.

---

## 13. Frequently asked questions

### Why are opened questions not marked as viewed?

Make sure you are signed in. Guests can read answers, but Q&A progress is not written to the database. If you are authenticated and see a synchronization error, check your connection and select **Try again**.

### Why can I not see the Saved filter or Reset progress button?

These controls are available only to signed-in users. Reset progress is also disabled when there are no viewed questions in the current topic.

### Will resetting progress delete my bookmarks?

No. Resetting clears only the viewed status of questions in the current topic. Your bookmarks remain in your account.

### Why did progress change when I returned to the tab?

DevLovers refreshes Q&A progress from the server when the browser tab regains focus. This is expected synchronization with the latest account state.

### Can I share a link to my saved questions?

The URL preserves the topic and active filter, but it does not expose your private bookmarks. Each signed-in user sees their own saved questions when opening the link.

### Why did a repeated quiz award no points?

Additional points depend on improving your previous result. Points are also not awarded for an incomplete attempt or an attempt with four or more integrity violations.

### Why is a guest quiz result missing from my dashboard?

A guest result is temporary. To transfer it, complete the quiz and use the sign-in or sign-up action offered on the result screen. For reliable tracking, sign in before starting.

### Why did my streak not change after reading Q&A?

The current activity streak is calculated from days with quiz attempts. Q&A activity is shown separately in the learning-progress section.

### Why is the AI Term Helper not responding?

The request may have exceeded a temporary rate limit, the selected term may be too long, or the AI service may be unavailable. Select a shorter, specific term, check your connection, and try again later.

### Why can I not see a particular payment method?

DevLovers displays only methods enabled for the current environment, device, and currency. Monobank is available only in UAH, and Google Pay requires a compatible device. Use another method offered by checkout.

### Where can I check an order status?

For an account order, open `/shop/orders`. For a guest order, use the link from the confirmation page or email and keep the order number.

### How do I report a problem?

- For an incorrect question, translation, or interface issue, use the **Feedback** form in the dashboard.
- For general questions, email [contact@devlovers.net](mailto:contact@devlovers.net).
- To propose an open-source change, create an issue or pull request in the GitHub repository.
- For a potential vulnerability, use only the private reporting channel described in [`SECURITY.md`](./SECURITY.md); do not create a public issue.

When reporting an issue, include the URL, language, approximate time, browser, and reproduction steps. Never send a password, session cookies, complete payment details, or secret keys.

---

*Last updated: August 30, 2026.*
