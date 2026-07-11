# Comments and Moderation

Status: domain hardening in progress
Date: 2026-07-11

Comments are designed to publish immediately by default. When a reader submits a valid comment and the launch checks do not flag it, the comment receives the `approved` moderation status and is returned in the post engagement summary.

Moderation checks can return three outcomes:

- `allow`: keep the default public-immediate behavior.
- `suspicious`: hold the comment in the suspicious queue for review.
- `block`: store the blocked state without publishing the comment.

The M09 implementation records comments, likes, share events, and moderation audit entries in the existing engagement tables when `DATABASE_URL` is configured. If a valid MDX post has not yet been synced into `post_metadata`, the engagement repository creates or updates that row from file metadata before writing likes, comments, or shares. Local builds without database credentials use an in-memory fallback so the app still renders.

Commenter email addresses and website URLs are private fields. They can be used for notifications, abuse review, deduping, or future profile workflows, but public comment objects expose only the display name, author kind, body, post slug, and publish timestamps.

Launch checks currently include:

- honeypot and form-age timing fields on comment and email-share forms
- short rolling rate limits for comments, likes, and email shares keyed by privacy-preserving post, IP hash, email hash, anonymous actor hash, and authenticated user scopes where available
- basic spam signals for blocked phrases, high link volume, and optional website URLs

Honeypot inputs are converted to boolean abuse signals before persistence. Raw honeypot payloads, raw IP addresses, and raw email addresses should not be stored in moderation context or audit metadata.

Suspicious comments are persisted with private fields and moderation audit entries so a moderation queue can read them. This PR intentionally does not build the broad admin dashboard or admin-auth enforcement; that remains M12/follow-up scope. Until moderator authentication is attached, queue access should stay server-internal or behind a separate guarded route.

Registered-user and subscriber actors are modeled in the service/repository layer, but the current request runtime only has anonymous cookies available. Do not treat authenticated or subscriber engagement UI states as complete until a current-session/subscriber resolver is wired.

AI moderation is still a hook shape only. A later provider can return categories, confidence, model metadata, and an allow/suspicious/block outcome without changing comment creation semantics.

## Launch Hardening Checks

The moderation domain includes reusable checks for launch-time abuse controls:

- `createHoneypotTimingCheck` blocks or holds submissions when a hidden honeypot field is filled, the form is submitted too quickly, the form age is invalid, or the form age is stale.
- `createKeywordSpamCheck` blocks known spam phrases and can hold suspicious keyword matches for moderator review.
- `createScopedRateLimitCheck` applies process-local rolling limits by available actor-specific scopes: post slug, IP hash, email hash, and registered user id.

Request context must pass hashed identifiers only. Raw IP addresses and raw email addresses should not be stored in moderation context or audit metadata. The in-memory rate-limit store is suitable for local development and narrow launch protection, but production should attach a durable shared store before relying on limits across server instances.

For #198, the engagement runtime shares one process-local scoped rate-limit store per server process and still keeps the existing repository-backed anonymous actor counts for comments, likes, and shares. A new durable rate-limit event table was not added in this pass because the current engagement schema already records the canonical comment/share/like events, while separate pre-write rate-limit events would need migration, cleanup, and cross-instance contention design. Until that follow-up is built, launches with multiple server processes can enforce the new post/IP/email/user scopes only within each process.

## Moderator Queue Contract

Suspicious comments are available through the repository/service queue methods and retain private fields for moderator-only review. Public list methods only return approved comments. Manual or system moderation transitions append audit entries when comments are approved, blocked, removed, or restored to public visibility.

The admin-authenticated queue UI and approve/reject/delete actions remain tracked in #192. Moderator screens must label email, website, IP hash, email hash, and session/user-agent hashes as private abuse-review fields.

## Follow-ups

- #191: wire the production email provider, durable share intents, dedupe, sender identity, and private recipient storage policy.
- #192: attach moderator/admin auth and queue actions.
- #198 follow-up: replace process-local scoped rate limits with durable shared storage if production deployment needs cross-instance enforcement.
