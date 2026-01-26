# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [0.1.0] - 2025-12-18

### Added

- Initial MVP release of the DevLovers platform
- Q&A section with categorized questions
- Quiz system with dynamic quiz pages
- Leaderboard with user rankings
- Blog section with static and dynamic content
- Static informational pages:
  - About
  - Contacts
  - Terms of Service
  - Privacy Policy
- Shop section (initial version)
- Authentication system (login & signup)
- Multi-language (i18n) support
- Theme switching:
  - Light
  - Dark
  - System theme
- Core application layout and routing
- API routes for authentication and quizzes
- Database integration using Drizzle ORM
- PostgreSQL database hosted on Neon
- Application deployed on Netlify
- Custom domain configured: https://devlovers.net

## [0.2.0] - 2025-12-28

### Added

- Server-authoritative currency handling in Shop based on locale (UAH for `uk`,
  USD otherwise)
- Per-currency product pricing model using `product_prices`
- Canonical money handling in integer minor units across orders and carts
- Centralized money formatting via a single Intl-based formatter
- Multi-language JavaScript Q&A question base (uk / en / pl)
- Git Q&A localization with category translations (uk / en / pl)
- Live tag search suggestions in Blog with Tab auto-complete
- Enter key support for adding blog filter tags

### Changed

- Shop catalog, cart, and checkout now resolve prices strictly by currency
- Orders enforce single-currency rule (no mixed-currency orders)
- Blog card layout redesigned with responsive images and improved visuals
- Blog filter controls and tag/category styling refined
- Q&A categories are now driven by structured, localized data
- Header navigation updated to point to quizzes list instead of a specific quiz

### Fixed

- Removed hardcoded `$` usage and float-based price calculations in Shop
- Eliminated mixed-currency edge cases and rounding risks
- Fixed duplicated JavaScript Q&A records in the database
- Hardened Q&A list rendering to prevent crashes on malformed list data
- Fixed malformed list items in Git question #96
- Allowed unauthenticated access to Quiz and Leaderboard pages (guest flow)

## [0.3.0] - 2026-01-01

### Added

- Social authentication via Google and GitHub (OAuth)
- System theme–based favicon switching (light / dark via `prefers-color-scheme`)
- Quiz cards redesign with categories, progress indicators, and status badges
- Countdown timer for quizzes with auto-submit on expiration
- Per-user quiz progress tracking (best score, attempts, completion %)
- Category-based quiz browsing with responsive tabs
- Multilingual content additions:
  - HTML questions base
  - React questions base
  - Localized About page (uk / en / pl)
- Unified platform & shop header with variant-based behavior

### Changed

- Login and signup flows updated to support OAuth providers
- Authentication UI enhanced with provider buttons and separators
- Quiz navigation and layout improved for better UX on desktop and mobile
- Blog and footer text fully localized using i18n strings
- Header/navigation logic centralized to prevent route-specific inconsistencies
- Shop pages aligned with unified header and navigation system

### Fixed

- Fixed GitHub OAuth redirect by correctly passing and validating state
  parameter
- Improved OAuth security with stronger CSRF protection
- Removed duplicated and legacy header components
- Prevented import breakages caused by outdated shop/platform shells
- Improved robustness of quiz duration calculation with reliable fallbacks
- Cleaned up redundant files, comments, and unused utilities

## [0.4.0] - 2026-01-21

### Added

- Complete authentication lifecycle:
  - Google & GitHub OAuth
  - Email verification
  - Password reset and recovery flows
- Full internationalization (uk / en / pl) across:
  - Authentication pages
  - Dashboard
  - Contacts
  - About page
  - Blog, Q&A, Quiz
  - Privacy Policy and Terms & Conditions
- New quiz content:
  - Angular, Vue.js, Node.js quizzes
  - HTML and React question bases
- Advanced quiz experience:
  - Countdown timer with persistence and auto-submit
  - Encrypted/hashed answers to prevent client-side cheating
  - Session persistence with quit confirmation
  - Guest quiz results synced after authentication
- Real-time online users counter with animated UI
- GDPR-compliant cookie consent banner with i18n support
- Unified platform & shop header system
- System theme–based favicon switching (light / dark)
- Initial SVG icon set for UI usage

### Changed

- Quiz UI redesigned:
  - Category-based tabs
  - Consistent QuizCard layout
  - Progress indicators and status badges
- Q&A UI refreshed:
  - Unified layout with shared background
  - Improved pagination and accordion readability
- Authentication pages refactored into reusable components
- Blog experience improved:
  - Redesigned blog page and cards
  - Category pages and header search
  - Recommended posts section
- Shop UI and layout unified across platform and admin views
- Tailwind theme tokens centralized for theme-aware styling
- Database migration history reset to a clean, linear baseline

### Fixed

- Fixed GitHub OAuth redirect and CSRF state handling
- Fixed quiz timer issues when switching languages
- Fixed Q&A API caching to always return fresh data
- Resolved multiple accessibility issues (WCAG, W3C, Lighthouse 100%)
- Hardened authentication redirects to prevent open-redirect vulnerabilities
- Stabilized shop checkout, refund, inventory, and webhook flows
- Improved Neon performance and reduced CU-hours usage
- Cleaned up redundant files, comments, and legacy code

## [0.5.0] - 2026-01-26

### Added

- AI-powered Word Helper for Q&A:
  - Text selection with floating “Explain” button
  - Multilingual explanations (uk / en / pl)
  - Draggable modal with caching and rate limiting
- Extensive automated testing:
  - 90%+ coverage for Quiz core logic (unit + integration)
  - Full Q&A component, hook, and API test coverage
- SEO & content enhancements for Blog:
  - Breadcrumb navigation (posts & categories)
  - Schema.org JSON-LD (Article, BreadcrumbList)
  - Improved metadata (descriptions, dates, authors)
- Improved navigation & UX:
  - Refactored responsive header with clear active states
  - GitHub stars indicator in header
  - Enhanced mobile menu with scroll locking
- Visual & UX polish across platform:
  - Unified category accent colors across Quiz & Q&A
  - Refined Leaderboard layout and mobile responsiveness
  - Updated About page interactions and game mechanics
- Infrastructure & environment support:
  - GROQ API integration for AI features
  - New environment variable support and documentation

### Changed

- Quiz UI unified with Q&A design system:
  - Shared CategoryTabButton component
  - Category-based accent colors across full quiz flow
  - Traffic-light countdown timer (green / yellow / red)
- Blog experience refined:
  - Improved search relevance and filtering UX
  - Better author navigation and category presentation
- Header, footer, and navigation styles aligned to brand tokens
- Shop UI polish:
  - Button styles and hero messaging updated
  - Stripe checkout success redirect fixed
- Removed deprecated Contacts page and all references

### Fixed

- Stabilized Leaderboard layout, spacing, and mobile behavior
- Fixed quiz timer persistence and anti-cheat messaging UX
- Improved accessibility and visual consistency across components
- Resolved locale duplication in Stripe checkout redirects
- Cleaned up redundant UI states, placeholders, and legacy styles
