# Billing and Subscription Domain

Status: initial skeleton
Date: 2026-07-09

## Source of Truth

The application should treat its local subscription and entitlement records as the source of truth for access decisions. Stripe is the future billing provider, but route guards, feed generation, and post access checks should read local state that was created or reconciled from Stripe events.

That keeps access policy under product control:

- A canceled paid subscription keeps access until the local `currentPeriodEnd` or `accessEndsAt`.
- A `past_due` subscription maps to a local grace period instead of relying on Stripe-hosted redirects.
- An `unpaid` or fully ended canceled subscription loses access after the local access end.
- Complimentary and admin-granted access can be represented locally without pretending it is a Stripe subscription.

## Idempotent Webhooks

Stripe can retry webhook delivery, deliver events out of order, or replay older events during manual recovery. Webhook handling should therefore persist a provider event id and processing state before mutating subscription data.

Processing the same event more than once should be safe: the handler should detect the existing event log row, skip duplicate side effects, and return the already-known result where possible. Subscription updates should be written as reconciliation from the latest local and provider state, not as blind increments.

The initial provider implementation intentionally throws not-configured errors. It defines the checkout, customer portal, and webhook contracts without making network calls, so future Stripe code can be added behind the same boundary.

## Local Access Evaluation

Post access uses the same local entitlement evaluator as private podcast access.
The evaluator accepts local subscription state and returns whether paid access is
currently allowed, the active tier ids, normalized entitlement keys, and the
local access end dates used for support/debugging.

Access behavior covered by the local evaluator:

- `active` and `trialing` subscriptions allow paid access until their local
  access window ends.
- `active` subscriptions with `cancelAtPeriodEnd` are treated as canceled with
  remaining access and continue until `currentPeriodEnd` or `accessEndsAt`.
- `past_due` and `grace_period` allow access through the configured grace
  window. The launch default is seven days.
- `canceled` allows access until `currentPeriodEnd` or `accessEndsAt`.
- `unpaid` allows access only when an explicit remaining access window is still
  open.
- `expired`, `paused`, and incomplete states deny paid access.
- `comped` allows paid access from local state and may carry tier-specific
  entitlement keys such as `tier:pro`.

Tier-specific posts check both active tier ids and `tier:<id>` entitlement keys.
Scheduled tier changes can be represented locally with `scheduledTierChange`.
Before the effective time, access remains on the current tier. Once the local
effective time is reached, the target tier is included in the active tier set.
Provider-owned checkout, portal, proration, and webhook reconciliation flows are
still responsible for writing those local states.
