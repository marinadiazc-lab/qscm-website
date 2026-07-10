# Subscribers

Status: M05 foundation implemented
Date: 2026-07-10

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
- `/admin/subscribers` and `/admin/subscribers/export` are intentionally
  disabled until #193 adds server-side RBAC and persistent operation audit logs.
  Do not expose subscriber emails, ids, import, or export publicly.

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
  `provider = resend` and `sync_status = pending`. A live Resend worker can
  consume those rows later without changing the subscriber service API.

## CSV Import Foundation

Import/export helpers exist in the domain layer for the future protected admin
surface, but the public admin route is disabled until #193.

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

PII must remain limited to protected admin routes once #193 lands.

## Follow-Ups

- Add admin-auth route protection once M04/M12 admin shell work is merged.
- Add a Resend worker that reads pending `subscriber_provider_syncs` rows and
  maps app-owned subscriber state into configured Resend audiences/segments.
- Add persistent admin operation audit tables if the final admin framework does
  not provide audit logging.
- Add signed preference links or authenticated account access before enabling
  the preference center.
