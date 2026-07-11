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
- short rolling rate limits for comments, likes, and email shares keyed by privacy-preserving IP hash, email hash, anonymous actor hash, authenticated user scopes, and a higher-ceiling post-wide scope
- basic spam signals for blocked phrases, high link volume, and optional website URLs

Honeypot inputs are converted to boolean abuse signals before persistence. Raw honeypot payloads, raw IP addresses, and raw email addresses should not be stored in moderation context or audit metadata.

Suspicious comments are persisted with private fields and moderation audit entries so the guarded moderation queue can read them. `/admin/comments` and its moderation action routes require an active user with the `moderator` or `admin` role.

Registered-user actors are resolved from the current auth session when one is available, while anonymous readers use the privacy-preserving actor cookie. Subscriber-specific engagement UI states remain follow-up work until a subscriber resolver is wired.

AI moderation is still a hook shape only. A later provider can return categories, confidence, model metadata, and an allow/suspicious/block outcome without changing comment creation semantics.

## Launch Hardening Checks

The moderation domain includes reusable checks for launch-time abuse controls:

- `createHoneypotTimingCheck` blocks or holds submissions when a hidden honeypot field is filled, the form is submitted too quickly, the form age is invalid, or the form age is stale.
- `createKeywordSpamCheck` blocks known spam phrases and can hold suspicious keyword matches for moderator review.
- `createScopedRateLimitCheck` applies process-local rolling limits by available actor-specific scopes: IP hash, email hash, and registered user id, plus a higher-ceiling post-wide scope.

Request context must pass hashed identifiers only. Raw IP addresses and raw email addresses should not be stored in moderation context or audit metadata. `ENGAGEMENT_HASH_SALT` is required in production so persisted email, IP, user-agent, session, and anonymous actor hashes are not derived from the public development salt.

For #198, production rate limits count persisted comment, share, and like records through the engagement repository, so the configured database is the shared store across server processes. Local no-database rendering still uses the in-memory repository and process-local scoped store.

## Moderator Queue Contract

Suspicious comments are available through the repository/service queue methods and retain private fields for moderator-only review. Public list methods only return approved comments. Manual or system moderation transitions append audit entries when comments are approved, blocked, removed, or restored to public visibility.

The admin comment queue exposes approve, reject, and delete actions. Approve sets the comment to `approved` and stamps `publishedAt` immediately; reject sets `blocked` and clears `publishedAt`; delete sets `removed` and clears `publishedAt`. The queue labels commenter email, website, and registered-user id as private moderator-only fields. Moderator screens must continue to label any future IP hash, email hash, and session/user-agent hashes as private abuse-review fields.

## Follow-ups

- #191: wire the production email provider, durable share intents, dedupe, sender identity, and private recipient storage policy.
- Rate-limit follow-up: add a separate pre-write attempt table if launches need durable counting for rejected invalid submissions as well as persisted engagement events.
