# Email Provider Skeleton

The app should depend on `EmailProvider`, not Resend directly.

Resend is the first planned provider for transactional email, contacts/audiences,
and newsletter or broadcast delivery. The current `ResendEmailProvider` is a
safe stub: it validates required configuration and refuses real API calls until
the adapter is implemented.

The app remains the source of truth for subscribers, entitlements, audience
membership, and send ownership. Resend receives synced state; it should not
decide product access.

Duplicate sends should be prevented with durable local `send_intent` records.
Each intent carries a stable `dedupeKey` and status. The database-backed version
should reserve one intent per dedupe key before calling any provider.

Kit can be added later as another adapter if creator CRM or automation features
become more important. Kit-specific concepts should stay inside that adapter.
