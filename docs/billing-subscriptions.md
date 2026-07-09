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
