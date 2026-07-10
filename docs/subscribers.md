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
- `/subscribers/preferences` loads preferences by `subscriberId` or email and
  persists opt-in changes or unsubscribe state.
- `/admin/subscribers` provides an admin search/import/export foundation with an
  explicit RBAC placeholder until the admin auth shell is merged.
- `/admin/subscribers/export` exports documented CSV columns for operational
  migration and audit review.

## Domain Rules

- Subscriber email is normalized to lowercase for matching.
- Duplicate signup is idempotent within a publication. An active or previously
  unsubscribed subscriber is returned instead of creating a second record.
- Verified user linking only attaches a subscriber when the verified user email
  matches the subscriber email for the same publication.
- `unsubscribed`, `bounced`, `complained`, and `suppressed` statuses suppress
  marketing email locally.
- Bounce, complaint, and suppression updates store local reason/provider
  metadata and queue a provider sync.
- Preference and status changes write `subscriber_provider_syncs` with
  `provider = resend` and `sync_status = pending`. A live Resend worker can
  consume those rows later without changing the subscriber service API.

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

## CSV Export

Export columns:

`id,email,name,status,source,userId,marketingEmailOptIn,productEmailOptIn,commentNotificationOptIn,syncStatus,syncProvider,createdAt,updatedAt`

PII is intentionally limited to the admin route and export endpoint. These
routes must be protected by admin/support/editor RBAC before production use.

## Follow-Ups

- Add admin-auth route protection once M04/M12 admin shell work is merged.
- Add a Resend worker that reads pending `subscriber_provider_syncs` rows and
  maps app-owned subscriber state into configured Resend audiences/segments.
- Add persistent admin operation audit tables if the final admin framework does
  not provide audit logging.
