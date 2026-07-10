# Auth and Accounts

Status: first domain skeleton
Date: 2026-07-09

The auth domain defines the early account model for readers, authors, and admins. It does not include Next.js routes or provider SDK code yet; those can wire into the exported types, pure service decisions, and in-memory repository when UI work begins.

Launch admin/dashboard work should expand the role model to match the M01 product policy: `reader`, `author`, `editor`, `moderator`, `support`, and `admin`. Subscriber access is handled through subscription/entitlement state attached to a reader account, not by assigning a separate staff role.

## OAuth linking

OAuth providers are `google`, `facebook`, and `apple`. `email_magic_link` is modeled as an auth provider too, but it is not treated as OAuth.

Provider account linking is conservative by default:

- If the exact provider account is already linked to the signed-in user, the decision is `already_linked`.
- If that provider account is linked to a different user, the decision is `reject`.
- If a signed-in user links a provider whose verified email matches their account email, the decision is `link`.
- If an OAuth sign-in only matches an existing user by email, the decision is `requires_confirmation`; the platform should not silently merge accounts on email alone.
- If the provider email is missing, unverified, or different from the signed-in user's email, the decision requires an explicit confirmation or is rejected.

This lets account settings flows be explicit while preventing unsafe background merges during sign-in.

## Magic-link email

Magic-link requests have a lifecycle status of `requested`, `consumed`, `expired`, or `revoked`. A request can only be consumed while it is still `requested` and before `expiresAt`.

The stored token should be a hash, not the raw emailed token. Email delivery can use the email domain later, but the auth domain only tracks the request, redirect target, timestamps, and optional session created after consumption.

## Admin checks

The current skeleton carries role strings: `reader`, `author`, and `admin`. Use `isAdminUser` or `hasAuthRole(user, "admin")` for admin gates while this skeleton is still small.

Before enabling the dashboard/admin workflows:

- Add `editor` for publishing, scheduling, metadata, and author review.
- Add `moderator` for comment queues, spam handling, and moderation audit context.
- Add `support` for subscriber, entitlement, feed-token, and documented billing-support workflows.
- Keep `reader` as the default public account role for profile/session management, comments, free-subscriber content, and paid content when an active entitlement allows it.

Role checks should also require an active user. The helper functions return false for disabled users so route handlers and future server actions can share the same guard behavior.
