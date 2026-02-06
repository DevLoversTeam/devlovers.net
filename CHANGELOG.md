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

## [0.5.1] - 2026-01-31

### Added

- Enhanced About page experience:
  - Refreshed Features and Pricing sections with clearer messaging
  - Interactive particle-based backgrounds with reduced-motion support
  - New reusable UI components: `ParticleCanvas`, `GradientBadge`,
    `SectionHeading`
  - Improved mobile responsiveness and layout stability
- Blog improvements:
  - Dynamic grid backgrounds across blog pages
  - Featured post CTA in blog hero
  - Author filtering via URL with adaptive header behavior
- Improved 404 error pages:
  - Fully localized (uk / en / pl)
  - Unified global rendering strategy
  - Clear navigation actions back to Home
- AI Word Helper updates:
  - Switched model to `llama3-70b-8192` for improved response quality
- Accessibility & UX:
  - Better keyboard navigation for highlighted terms
  - Improved touch and mobile interaction handling

### Changed

- Home page refinements:
  - Hero section refactored into smaller reusable components
  - Updated color palette, spacing, animations, and mobile behavior
- Footer styling updated to match refreshed brand visuals
- Blog layout aligned with updated design language and spacing rules
- Default locale updated from `uk` to `en` with safer type validation
- Internal codebase cleanup:
  - Improved i18n defaults and validation
  - Better cache initialization and error handling

### Fixed

- Fixed blog post image rendering for latest posts
- Resolved layout centering issues on Leaderboard
- Improved stability of text selection detection for AI helper
- Fixed social icon hover styles in dark mode
- Reduced visual overlap issues on small mobile screens

## [0.5.2] - 2026-02-01

### Added

- About page enhancements:
  - Refreshed Features and Pricing sections with clearer messaging
  - Interactive particle-based backgrounds with reduced-motion support
  - New reusable UI components: ParticleCanvas, GradientBadge, SectionHeading
  - Improved mobile responsiveness and layout stability
- Blog improvements:
  - Pagination support for blog listing
  - Dynamic grid backgrounds across blog pages
  - Featured post CTA in blog hero
  - Author filtering via URL with adaptive header behavior
- AI Word Helper updates:
  - Improved error handling with simplified retry UX
  - Backend refactor for Vercel compatibility
  - Rate limiting enforcement for AI explanation endpoint
- Caching & performance:
  - Upstash Redis cache for Q&A (cache-aside strategy)
  - Robust cache parsing and invalidation handling
- Infrastructure & tooling:
  - Netlify deployment configuration updates
  - Redis environment variable support
  - CodeRabbit automated review configuration

### Changed

- Home page UI refinements:
  - Refactored Hero section into reusable components
  - Improved primary CTA button styling and interactions
  - Updated card layouts and online users counter visuals
- Blog experience refined:
  - Improved text formatting and rendering consistency
  - Better search, filtering, and pagination UX
- Shop UI updates:
  - Unified storefront styles across components
  - Improved checkout flow state handling
  - Added metadata across shop routes for better SEO
- Default locale changed from `uk` to `en` with safer type validation
- Internal refactors:
  - Codebase cleanup and structural simplification
  - Improved cache initialization and error handling

### Fixed

- Fixed blog text formatting and latest post image rendering
- Resolved layout centering issues on Leaderboard
- Fixed social icon hover styles in dark mode
- Improved stability of text selection detection for AI helper
- Fixed locale duplication and routing edge cases
- Reduced visual overlap issues on small mobile screens

## [0.5.3] - 2026-02-04

### Added

- Quiz performance improvements:
  - Redis-based answer verification replacing AES encryption
  - Server-side quiz cache initialization to reduce verification latency
  - Debug endpoints for inspecting and clearing quiz caches (development only)
- Caching & data layer:
  - Persistent Redis caching for static Quiz and Q&A data (TTL removed)
  - Cache-aside strategy for quiz answers and Q&A content
- Internationalization & accessibility:
  - Translations for blog categories, CTA variants, and UI components (en / uk / pl)
  - Improved aria-label coverage for navigation, cart, theme toggle, and search
- Developer experience:
  - Finalized ESLint Flat Config for frontend
  - Stable Prettier + Tailwind class sorting workflow
  - Consistent format-on-save behavior across the team

### Changed

- Quiz system refactor:
  - Simplified answer verification flow using Redis lookups
  - Improved guest session restoration after quiz completion
  - Language switch now preserves quiz results for guest users
- Layout & UI refinements:
  - Removed duplicate padding on quiz routes
  - Improved mobile alignment for Quiz Rules and headers
  - Refined leaderboard component structure and lint stability
- Shop module cleanup:
  - Normalized component naming (PascalCase)
  - Reorganized test structure under domain boundaries
  - Unified active-state and hover styling across shop routes
- Blog UI improvements:
  - Fixed mobile paddings and spacing consistency
  - Improved responsive header and layout behavior

### Fixed

- Fixed mobile layout misalignment on quiz pages
- Fixed guest language switch issues on quiz result screen
- Improved WCAG color contrast compliance across quiz UI
- Fixed ESLint, Prettier, and test configuration inconsistencies
- Removed unused files, dead code, and outdated utilities
- Improved reliability of quiz session restoration and state handling

## [0.5.4] - 2026-02-05

### Added

- Quiz SEO & performance improvements:
  - Dynamic metadata generation for quizzes list and quiz detail pages
  - i18n-aware meta titles and descriptions (en / uk / pl)
  - Browserslist configuration targeting modern browsers
- Quiz content updates:
  - Expanded JavaScript Fundamentals quiz from 10 to 40 questions
- Dashboard UI improvements:
  - New DynamicGridBackground for cleaner visual hierarchy
  - Refined ProfileCard and StatsCard layouts
- Accessibility & i18n:
  - Improved aria-label coverage across navigation and UI controls
  - Refined English, Polish, and Ukrainian UI copy and punctuation

### Changed

- Quiz UX refinements:
  - Countdown timer animation stabilized on tab switch and session restore
  - Emoji replaced with icon-based indicators for consistent styling
  - Anti-cheat logic improved to distinguish touch vs mouse events
- Q&A experience improvements:
  - Pagination scroll now targets section instead of page top
  - Mobile tap lock resolved by clearing text selection on interaction
- Home & layout updates:
  - Improved code card sizing and responsive behavior
  - Online users counter repositioned for better mobile UX
- Shop UX refinements:
  - Canonicalized legacy “View all” filters
  - Improved cart CTA behavior and badge layering
- Blog & CMS:
  - Refactored blog image rendering and filtering logic
  - Improved pagination state handling
- Styling & consistency:
  - Fixed Tailwind v4 canonical class warnings
  - Unified token-based styling across dashboard, 404 page, and controls

### Fixed

- Fixed mobile anti-cheat false positives on quiz pages
- Removed render-blocking Font Awesome CSS
- Fixed quiz timer progress bar desynchronization
- Improved table text contrast in dark mode
- Fixed cart badge overlay issues in header
- Resolved multiple mobile spacing and padding inconsistencies

## [0.5.5] - 2026-02-06

### Added

- About page UX improvements:
  - Updated icons in pricing and sponsorship sections
  - Renamed “Latest Contributors” to “Open Source Heroes” (en / uk / pl)
  - Improved mobile readability for disclaimers and interactive game text
  - Performance optimization: ParticleCanvas disabled on mobile devices
- Q&A navigation improvements:
  - Category-aware Git topic navigation
  - Prevented unintended scroll on desktop pagination
- Platform documentation updates

### Changed

- About page refinements:
  - Improved visual consistency and spacing across sections
  - Optimized theme toggle animation for smoother transitions
  - Updated LinkedIn follower count display
- Blog layout:
  - Fixed background paddings for better responsive consistency
- Shop backend behavior:
  - Checkout now hard-blocked when PAYMENTS_ENABLED=false
  - Early 503 response prevents order creation and inventory reservation

### Fixed

- Fixed incorrect Git topic links in Q&A cards
- Resolved multiple mobile UI issues on About page
- Prevented checkout edge case creating paid orders when payments are disabled
- Improved accessibility and readability across updated UI sections

## [0.5.6] - 2026-02-06

### Added

- Q&A UI enhancements:
  - Smooth staggered accordion entrance animations after data fetch
  - Shared animated loader component reused across Q&A sections
- Leaderboard visual improvements:
  - Reused Q&A DynamicGridBackground for visual consistency
  - Enhanced title animation with gradient wave effect

### Changed

- Q&A layout refinements:
  - Removed square backdrop for cleaner visual hierarchy
  - Ensured background fills full viewport height
- Navigation behavior:
  - Pagination now consistently resets scroll position to the top of content

### Fixed

- Fixed inconsistent scroll behavior when navigating Q&A pages
- Improved UX predictability across desktop and mobile devices
