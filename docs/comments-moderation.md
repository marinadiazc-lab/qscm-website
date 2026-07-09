# Comments and Moderation

Status: first domain skeleton
Date: 2026-07-09

Comments are designed to publish immediately by default. When a reader submits a valid comment and the configured checks do not flag it, the comment receives the `approved` moderation status and can be rendered as a `PublicImmediateComment`.

Moderation checks can return three outcomes:

- `allow`: keep the default public-immediate behavior.
- `suspicious`: hold the comment in the suspicious queue for review.
- `block`: store the blocked state without publishing the comment.

The first implementation includes TypeScript contracts for spam decisions, rate-limit decisions, and future AI moderation decisions. AI moderation is intentionally a hook shape only for now, so a later provider can return categories, confidence, model metadata, and an allow/suspicious/block outcome without changing comment creation.

Commenter email addresses and website URLs are private fields. They can be used for notifications, abuse review, deduping, or future profile workflows, but public comment objects expose only the display name, author kind, body, post slug, and publish timestamps.
