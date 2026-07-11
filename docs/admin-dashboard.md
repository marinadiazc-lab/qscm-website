# Admin Dashboard

The M12 admin foundation lives under `/admin` and is protected server-side. The
shared shell allows staff roles needed by subscriber operations, while
non-subscriber pages assert the stricter admin-only guard before loading data.
Subscriber operations use the subscriber-admin guard, which allows `admin`,
`support`, and `editor` roles. Anonymous users are sent to login and signed-in
users without an allowed staff role receive the same server-side denial path as
the rest of the protected admin surface.

The dashboard uses existing domain and database ownership:

- subscribers come from the subscriber lifecycle tables and provider sync rows
- tiers and prices come from the local subscription tier tables
- access grants come from local entitlement grants
- comments come from persisted engagement and moderation audit tables
- media, podcast, webhook, and audit views read their existing tables

Posts remain Markdown/MDX source of truth. The admin foundation intentionally
does not include a WYSIWYG post editor or a browser-authored replacement for
file-authored posts.

## Current Pages

- `/admin` shows launch health metrics for subscribers, paid access, revenue
  placeholder state, pending comments, email sync failures, and webhook failures.
- `/admin/subscribers` supports subscriber search/filter inspection, protected
  CSV import at `/admin/subscribers/import`, and protected CSV export at
  `/admin/subscribers/export`. Import and export write restricted
  `audit_logs` rows with actor, operation, counts, and failure summaries.
- `/admin/tiers` shows tiers, entitlement keys, prices, and checkout enablement.
- `/admin/access` shows entitlement grants.
- `/admin/comments` shows moderation queues by persisted moderation status.
- `/admin/media` shows registered media metadata and URLs.
- `/admin/podcast` shows podcast shows, episode counts, and private token counts.
- `/admin/logs` shows redacted webhook and audit log rows.

## Disabled Actions

Creation, update, moderation, upload, retry, and grant/revoke controls are shown
as disabled where safe audited mutation APIs do not exist yet. Those workflows
should be implemented with operation-specific server actions or route handlers
that write `audit_logs` before the controls are enabled.
