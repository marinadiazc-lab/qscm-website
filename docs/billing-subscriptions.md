# Billing and Subscription Domain

Status: Stripe foundation
Date: 2026-07-11

## Source of Truth

The application should treat its local subscription and entitlement records as the source of truth for access decisions. Stripe is the future billing provider, but route guards, feed generation, and post access checks should read local state that was created or reconciled from Stripe events.

That keeps access policy under product control:

- A canceled paid subscription keeps access until the local `currentPeriodEnd` or `accessEndsAt`.
- A `past_due` subscription maps to a local grace period instead of relying on Stripe-hosted redirects.
- An `unpaid` or fully ended canceled subscription loses access after the local access end.
- Complimentary and admin-granted access can be represented locally without pretending it is a Stripe subscription.

## Stripe Configuration

Required runtime values:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Optional Stripe API pin:

```bash
STRIPE_API_VERSION=2025-...
```

Required job secret for reconciliation:

```bash
BILLING_RECONCILIATION_SECRET=local-reconcile-secret
```

Seeded tier/product mappings are read from environment variables. Omit a price id
to keep that interval hidden from checkout while retaining any existing local
subscription rows that reference older prices.

```bash
STRIPE_SUPPORTER_PRODUCT_ID=prod_...
STRIPE_SUPPORTER_MONTHLY_PRICE_ID=price_...
STRIPE_SUPPORTER_ANNUAL_PRICE_ID=price_...
STRIPE_FOUNDING_MEMBER_PRODUCT_ID=prod_...
STRIPE_FOUNDING_MEMBER_MONTHLY_PRICE_ID=price_...
STRIPE_FOUNDING_MEMBER_ANNUAL_PRICE_ID=price_...
```

The seed stores Stripe product ids on `subscription_tiers` and price ids on
`tier_prices`. `tier_prices.active_for_checkout = false` disables new checkout
for that interval without deleting the historical price row. Existing
subscriptions keep their local `tier_price_id`, access window, and entitlement
grants until webhook or reconciliation updates say otherwise.

## Checkout And Portal

`POST /api/billing/checkout` requires an authenticated account and a local
`tierPriceId`. The server loads the active local price, finds or creates a local
subscriber and `billing_customers` row, creates a Stripe customer if needed, and
then creates a subscription-mode Checkout Session with automatic tax and billing
address collection enabled.

`POST /api/billing/portal` requires an authenticated account with a mapped Stripe
customer and redirects to Stripe's billing portal. The portal return URL lands on
`/account`.

## Idempotent Webhooks

Stripe can retry webhook delivery, deliver events out of order, or replay older events during manual recovery. Webhook handling should therefore persist a provider event id and processing state before mutating subscription data.

Processing the same event more than once should be safe: the handler should detect the existing event log row, skip duplicate side effects, and return the already-known result where possible. Subscription updates should be written as reconciliation from the latest local and provider state, not as blind increments.

`POST /api/billing/webhook` verifies the Stripe signature against the raw request
body and logs every event by `(provider, provider_event_id)`. Subscription events
are applied in a database transaction: the local subscription row is upserted
from canonical Stripe state and entitlement grants for that subscription are
refreshed from the mapped tier.

Handled events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.payment_succeeded`

## Reconciliation

`POST /api/billing/reconcile` is protected by `x-qscm-job-secret:
$BILLING_RECONCILIATION_SECRET`. It lists local Stripe customers, fetches their
canonical Stripe subscriptions, reapplies local subscription/entitlement state,
and logs discrepancies where local status differed from Stripe before the repair.

Example:

```bash
curl -X POST http://localhost:3000/api/billing/reconcile \
  -H "x-qscm-job-secret: local-reconcile-secret"
```

The job is safe to rerun. Wire it to Vercel Cron or another scheduler after the
secret is configured in production.

## Local Stripe Webhook Testing

Install and authenticate the Stripe CLI, then forward events to the Next.js app:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`. Replay key test
states with:

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed
stripe trigger invoice.payment_succeeded
```

For manual replay, use the Stripe Dashboard or CLI event resend against the same
local endpoint. Replayed event ids should be logged once and return an ignored or
processed idempotent result on duplicates.

## Local Access Evaluation

Post access uses the same local entitlement evaluator as private podcast access.
On server render, the post route resolves the current auth session and reads
local subscriber, subscription, tier, and entitlement-grant rows before deciding
whether to include the restricted post body. If auth or database state is absent,
the route falls back to an anonymous reader instead of trusting client state.
The evaluator accepts local subscription state and returns whether paid access
is currently allowed, the active tier ids, normalized entitlement keys, and the
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
- `comped` allows paid access from local state. Active admin-comped
  `entitlement_grants` can also override an otherwise free or ended local
  subscription, while revoked grants are excluded from future access.

Tier-specific posts check both active tier ids and `tier:<id>` entitlement keys.
Scheduled tier changes can be represented locally with `scheduledTierChange`.
Before the effective time, access remains on the current tier. Immediate changes
add the target tier once effective. Period-end changes replace the prior tier
with the target tier once effective, so a completed downgrade no longer grants
the old higher tier.
Provider-owned checkout, portal, proration, and webhook reconciliation flows are
still responsible for writing subscription transition metadata. Admin/support
grant and revoke mutations, audit-log writes for those mutations, and downstream
email segment sync remain tracked in #188. Wiring additional auth/session or
repository behavior needed by future provider work remains tracked in #189.
