# Email Provider

The email domain starts with provider-neutral TypeScript contracts in
`src/domains/email`. App code should depend on `EmailProvider`, not on a Resend
client directly.

## Resend Default

Resend is the first real provider for transactional email and newsletter or
broadcast delivery. `ResendEmailProvider` wraps the official SDK behind the
app-owned boundary so tests can inject in-memory providers or mocked Resend
clients.

The provider boundary should continue to track Resend's API surface without
leaking SDK-specific types into app code. Current Resend references for the
areas used by this domain:

- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/api-reference/contacts/create-contact
- https://resend.com/docs/api-reference/broadcasts/create-broadcast
- https://resend.com/docs/api-reference/broadcasts/send-broadcast
- https://resend.com/docs/webhooks/introduction

Required production environment:

- `RESEND_API_KEY`
- `RESEND_DEFAULT_FROM`, for example `QSCM <hello@example.com>`
- `RESEND_DEFAULT_REPLY_TO` when replies should route somewhere else
- `RESEND_DEFAULT_AUDIENCE_ID` when contact upserts do not pass an audience id
- `RESEND_FREE_SUBSCRIBER_AUDIENCE_ID`,
  `RESEND_PAID_SUBSCRIBER_AUDIENCE_ID`, and
  `RESEND_SUPPRESSED_SUBSCRIBER_AUDIENCE_ID` for subscriber contact sync
- `RESEND_WEBHOOK_SECRET` for webhook verification at the route layer

`createResendEmailProviderFromEnv` refuses to create a live SDK client when
`NODE_ENV=test` unless a mock client is injected or `RESEND_ALLOW_TEST_SENDS=true`
is set. Unit tests should not send live email.

The app remains the source of truth for subscribers, entitlement state, audience
membership, and send ownership. Resend receives contact upserts into one
selected audience; segment and custom-field sync are not treated as successful
unless the provider adapter performs those operations. `ResendSubscriberSyncWorker`
consumes pending `subscriber_provider_syncs` rows and calls the provider
boundary with injected credentials or a mock provider in tests.

## Duplicate Send Prevention

Every transactional or broadcast send should be created from a local send intent
before it reaches a provider. `EmailSendService` reserves the intent, calls the
provider once, stores the provider message id, and records skipped duplicates as
delivery logs without changing the original terminal intent row. Server code can import
`src/domains/email/repository.ts` directly for `DrizzleEmailSendIntentRepository`,
which uses the database unique index on `(publication_id, dedupe_key)` and a
conditional reservation update so concurrent workers cannot reserve the same
logical send twice.

Database tables `email_send_intents`, `email_broadcasts`, `email_delivery_logs`,
and `email_provider_events` persist the foundation for production workflows.

## Templates

`src/domains/email/templates.ts` contains app-owned transactional templates for:

- magic-link sign in
- receipts
- subscription updates
- comment notifications
- share-by-email
- MDX post newsletters

Each template returns plain text and HTML. The newsletter template includes
Resend's unsubscribe placeholder for provider-managed broadcast unsubscribe
links.

## Broadcasts From MDX

Posts can opt into broadcast generation through frontmatter:

```yaml
newsletter:
  enabled: true
  subject: "Optional email subject"
  previewText: "Optional inbox preview"
  audience: "free_subscribers"
```

This is the only shared content-type/frontmatter addition made for the M06 email
work. It is intentionally optional so access-control branches can merge without
changing post visibility behavior.

`createNewsletterBroadcastFromPost` converts a published post into a
`CreateEmailBroadcastInput`. Audience targeting starts from post visibility:
`public`, `free_subscribers`, `paid_any`, or `specific_tiers`. Tier-specific
posts map tier ids to configured segment ids, falling back to stable
`tier:<tierId>` segment keys when provider ids are not configured. Free
subscriber posts target both free and paid subscriber audiences when both are
configured, matching the server access rule that paid subscribers can read free
subscriber content.

`EmailBroadcastService` owns the app pipeline: it creates or reuses the local
`email_broadcasts` row, creates the provider draft, stores the provider
broadcast id on the local row, and sends through `EmailSendService` so a durable
`email_send_intents` row records the send attempt. Local broadcast ids remain
the app source of truth; provider ids are stored as external references for
Resend operations.

The Resend adapter currently creates draft broadcasts and sends existing
provider drafts immediately. Scheduled broadcast orchestration remains a future
workflow so the implementation can match the provider contract end to end
instead of passing incomplete scheduling fields.

## Provider Events

Resend webhooks should be verified with the raw request body and the Svix
headers (`svix-id`, `svix-timestamp`, `svix-signature`) before processing.
`EmailProviderEventProcessor` dedupes provider event ids only for the lifetime
of the process. Durable webhook idempotency must persist `email_provider_events`
before #52 can close. The in-process processor maps:

- `contact.updated` with `data.unsubscribed: true` to local `unsubscribed`
- `email.bounced` to local `bounced`
- `email.complained` to local `complained`
- `email.suppressed` to local `suppressed`

Delivery events are recorded through the delivery-log foundation for later M12
admin dashboards.

## Post Sharing By Email

M09 adds the post email-share foundation through the engagement service. The
route records an `email` share event immediately and can call any configured
`EmailProvider` through `sendTransactional`. In the default app wiring no live
provider is required; without a provider, the route returns a recorded state and
does not attempt delivery.

Follow-up provider work should attach a real `EmailProvider`, create durable
send intents before calling the provider, and decide the approved sender/from
identity for reader-to-reader shares.

Email-share dedupe keys and local share context must not include the raw
recipient email address. Use a normalized email hash in identifiers and reserve
the raw recipient address only for the provider `to` field at send time.

## Sending Domain And DNS

Resend requires a verified sending domain before production sends. In the
dashboard, add the sending domain and copy the generated DNS records exactly to
the DNS host. Resend documents DKIM/SPF configuration through `TXT` and `MX`
records; add DMARC for the production domain as part of the same launch
checklist.

External access is still required to verify the real production domain in the
Resend dashboard and DNS provider. Issue #47 should remain open until those
records are configured and Resend reports the domain verified. This cannot be
completed from the repo alone.

## Future Kit Adapter
