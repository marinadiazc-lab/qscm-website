# Comments and Moderation

Status: M09 engagement foundation
Date: 2026-07-10

Comments are designed to publish immediately by default. When a reader submits a valid comment and the launch checks do not flag it, the comment receives the `approved` moderation status and is returned in the post engagement summary.

Moderation checks can return three outcomes:

- `allow`: keep the default public-immediate behavior.
- `suspicious`: hold the comment in the suspicious queue for review.
- `block`: store the blocked state without publishing the comment.

The M09 implementation records comments, likes, share events, and moderation audit entries in the existing engagement tables when `DATABASE_URL` is configured. Local builds without database credentials use an in-memory fallback so the app still renders.

Commenter email addresses and website URLs are private fields. They can be used for notifications, abuse review, deduping, or future profile workflows, but public comment objects expose only the display name, author kind, body, post slug, and publish timestamps.

Launch checks currently include:

- honeypot fields on comment and email-share forms
- short rolling rate limits for comments, likes, and email shares keyed by a privacy-preserving anonymous actor hash
- basic spam signals for blocked phrases, high link volume, and optional website URLs

Suspicious comments are persisted with private fields and moderation audit entries so a moderation queue can read them. This PR intentionally does not build the broad admin dashboard or admin-auth enforcement; that remains M12/follow-up scope. Until moderator authentication is attached, queue access should stay server-internal or behind a separate guarded route.

AI moderation is still a hook shape only. A later provider can return categories, confidence, model metadata, and an allow/suspicious/block outcome without changing comment creation semantics.
