# Subscribers

Status: M05 subscriber lifecycle follow-ups implemented
Date: 2026-07-11

## Scope

The subscriber lifecycle is app-owned. External providers can mirror subscriber
state, but local database state remains the source of truth for signup,
preferences, delivery health, and account linking.

Implemented surfaces:

- `POST /api/subscribers/signup` validates email, normalizes duplicates, stores
  a subscriber, creates default preferences, and marks Resend sync as pending.
- `/subscribe` posts to the free signup endpoint.
- `/subscribers/preferences` and `POST /api/subscribers/preferences` are
  intentionally disabled until the product has authenticated access or signed
  preference tokens. Do not allow preference lookup or mutation by plain email
  or subscriber id.
- `/admin/subscribers` is a protected subscriber inspection page for `admin`,
  `support`, and `editor` users with search/filter support,
  account/subscription/email-sync summary columns, protected CSV import at
  `/admin/subscribers/import`, and protected CSV export at
  `/admin/subscribers/export`.
- Import and export persist restricted `audit_logs` entries with actor,
  operation, counts, and bounded failure summaries. Subscriber emails remain in
  protected admin surfaces and exports, not audit metadata.

## Domain Rules

- Subscriber email is normalized to lowercase for matching.
- Duplicate signup is idempotent within a publication. The public endpoint
  returns the same generic success message for first-time and duplicate signup.
  The database adapter catches the normalized publication/email unique conflict
  so concurrent requests read back the existing subscriber instead of failing.
- Verified user linking domain logic only attaches a subscriber when the
  verified user email matches the subscriber email for the same publication.
  This is not wired to login/account creation yet, so #39 remains open.
- `unsubscribed`, `bounced`, `complained`, and `suppressed` statuses suppress
  marketing email locally.
- Bounce, complaint, and suppression updates store local reason/provider
  metadata and queue a provider sync.
- Preference and status changes write `subscriber_provider_syncs` with
  `provider = resend` and `sync_status = pending`. `ResendSubscriberSyncWorker`
  consumes pending rows, mirrors app-owned subscriber state into Resend contact
  fields/audiences/segments, and marks rows `synced` or `failed`.

## CSV Import

Supported input columns:

- `email` required
- `name`
- `status`: `active`, `unsubscribed`, `bounced`, `complained`, or `suppressed`
- `source`
- `marketingEmailOptIn`
- `productEmailOptIn`
- `commentNotificationOptIn`

Boolean values accept `true`, `false`, `1`, `0`, `yes`, `no`, `y`, and `n`.

## CSV Export Foundation

Export columns:

`id,email,name,status,source,userId,marketingEmailOptIn,productEmailOptIn,commentNotificationOptIn,syncStatus,syncProvider,createdAt,updatedAt`

PII must remain limited to protected admin routes.

## Resend Sync Worker

`ResendSubscriberSyncWorker` accepts an injected `EmailProvider`, so tests can
use a mock provider without live Resend credentials. Production code can create
the worker with `createResendSubscriberSyncWorkerFromEnv`, which uses the
database repository and `createResendEmailProviderFromEnv`.

Audience and segment mapping is configured with:

- `RESEND_FREE_SUBSCRIBER_AUDIENCE_ID`
- `RESEND_PAID_SUBSCRIBER_AUDIENCE_ID`
- `RESEND_SUPPRESSED_SUBSCRIBER_AUDIENCE_ID`
- `RESEND_FREE_SUBSCRIBER_SEGMENT_ID`
- `RESEND_PAID_SUBSCRIBER_SEGMENT_ID`
- `RESEND_SUPPRESSED_SUBSCRIBER_SEGMENT_ID`

Suppressed app states (`unsubscribed`, `bounced`, `complained`, `suppressed`)
and local opt-outs are reflected in the contact sync payload. Paid/tier mapping
comes from subscriber metadata (`paidSubscriber`, `tier`, `tierSlug`, or
`subscriptionTier`) until the broader entitlement projection feeds this worker
directly.

## Follow-Ups

- Wire the worker into the production job runner/scheduler once worker
  infrastructure is selected.
- Feed paid/tier entitlement projection directly into subscriber sync metadata
  when the billing access state worker exists.
- Add signed preference links or authenticated account access before enabling
  the preference center.
