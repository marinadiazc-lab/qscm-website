# Testing

This project uses Vitest for fast TypeScript tests around the domain modules and content metadata.

## Commands

- `npm run lint` checks the repository with ESLint.
- `npm run typecheck` runs TypeScript with `noEmit`.
- `npm run test` runs the Vitest suite once.
- `npm run build` verifies the Next.js production build.

## Coverage Added In Wave 1

- Subscriptions and access decisions, including active, free, missing, canceled, unpaid, expired, and the seven-day past-due grace policy for paid web and private podcast access.
- Auth and account linking decisions, including provider conflicts, verified email matches, confirmation paths, sessions, magic links, and repository copies.
- Podcast private token lifecycle, entitlement-gated show/episode access, feed sorting, limits, and denied episode tracking.
- Comments and email behavior, including comment validation, public/privacy-safe comment projections, moderation queues, contact upserts, and send dedupe.
- Public/private post content metadata used by the route layer.

## Coverage Added In Wave 2

- Post access evaluation for public, free-subscriber, paid-any, and
  tier-specific visibility.
- Anonymous versus authenticated route-body behavior, including restricted body
  filtering before MDX rendering.
- Grace-period, canceled-through-period, expired, comped, and local tier
  transition behavior for paid access.

## Coverage Added In Wave 3

- Protected admin dashboard foundation with dynamic admin pages for subscribers,
  tiers, access grants, comments, media, podcast state, and operational logs.
- Focused admin safety tests cover CSV formula neutralization and operational
  log redaction helpers. Production build keeps the admin pages server-rendered
  and the subscriber export route behind its own admin guard.

## CI Gate

Pull requests run lint, typecheck, tests, and build in GitHub Actions. The existing Vercel production deploy workflow also verifies the same checks before deploying from `main`.

Stripe webhook integration tests and browser-based end-to-end tests are intentionally left as follow-up work because the current codebase does not yet include the required Stripe or E2E runtime surfaces.
