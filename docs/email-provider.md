# Email Provider Skeleton

The email domain starts with provider-neutral TypeScript contracts in
`src/domains/email`. App code should depend on `EmailProvider`, not on a Resend
client directly.

## Resend Default

Resend is the planned first real provider for transactional email and
newsletter or broadcast delivery. The current `ResendEmailProvider` only
validates required configuration (`apiKey` and `defaultFrom.email`) and then
throws explicit not-configured errors for every API operation. This keeps the
repo buildable while preventing accidental network calls or real sends before
the adapter is implemented.

The app remains the source of truth for subscribers, entitlement state, audience
membership, and send ownership. Resend should receive synced contact and segment
state from the app; it should not become the place where product access is
decided.

## Duplicate Send Prevention

Every future transactional or broadcast send should be created from a local
`send_intent` record before it reaches a provider. The intent should carry:

- a stable `dedupeKey` for the logical send
- an intent status such as `pending`, `reserved`, `sending`, `sent`, `failed`,
  `suppressed`, or `skipped_duplicate`
- provider identifiers once a send is accepted

The eventual database-backed flow should reserve one intent per dedupe key,
send only from the reserved intent, and mark later attempts as
`skipped_duplicate`. The in-memory provider already mirrors that behavior for
tests and development examples, but the durable guarantee should live in the
app database.

## Future Kit Adapter

Kit can be added later as another `EmailProvider` implementation if creator CRM
or automation features become more important. Kit-specific concepts should stay
inside that adapter. The domain types should continue to speak in app-owned
terms: subscribers, contacts, audiences, segments, broadcasts, transactional
sends, and send intents.
