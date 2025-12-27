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
