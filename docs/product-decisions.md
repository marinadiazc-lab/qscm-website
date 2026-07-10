# Product Policy Decision Log

Status: active  
Owner: QSCM product/engineering  
Last updated: 2026-07-10

This log is the durable source of truth for launch product policy decisions. Future reversals or material changes should add a new dated entry instead of editing history in place.

## 2026-07-10: Launch editorial roles and permissions

Owner: QSCM product/engineering  
Affected issues: #2, #7

Decision:

- Launch with a small editorial team model: `admin`, `editor`, `author`, `moderator`, and `support`, plus the default reader/subscriber role used for public accounts.
- `admin` can administer users, roles, billing support actions, publication settings, tiers, access grants, media, comments, podcast settings, and email/broadcast operations.
- `editor` can read drafts, create and edit posts or podcast episodes, publish or unpublish content, schedule content, manage content metadata, and review author work.
- `author` can create drafts, edit their own drafts, submit work for review, and read their own unpublished work. Publishing and access-rule changes require `editor` or `admin`.
- `moderator` can read comment queues, approve, reject, mark spam, delete comments, and view moderation context needed for abuse handling. Moderators cannot publish editorial content or administer billing.
- `support` can read subscriber, subscription, entitlement, and feed-token state needed for customer support, resend account or feed links, rotate/revoke podcast tokens, and apply documented support workflows. Support cannot publish content, change roles, or change product policy.
- Launch-blocking permissions: admin gates, publish gates, comment moderation gates, billing/support read gates, podcast token rotation/revocation gates, and email send approval gates.
- Deferred permissions: granular per-section role scopes, multi-publication role assignments, custom roles, field-level edit restrictions, and browser-based post authoring workflows.

Rationale:

A small role set covers the first release without turning role management into its own product. It separates high-risk actions such as publishing, billing support, moderation, and broadcast sending while keeping implementation compatible with a future permissions table.

Follow-up/verification:

- Verify implementation roles and guards against this matrix before enabling admin workflows.
- Add entitlement and route-guard tests when the app implements admin/editorial surfaces.
- Keep `docs/auth.md` and architecture role examples aligned with this launch role set.

## 2026-07-10: Failed-payment grace policy

Owner: QSCM product/engineering  
Affected issues: #3, #7

Decision:

- Use a 7-day failed-payment grace period for both web paid-content access and private podcast access.
- Stripe subscription state is provider input only. App-local subscription and entitlement state is the source of truth for route guards, post access, and private feed generation.
- `active` and `trialing` subscriptions retain paid web and podcast access through their local entitlement windows.
- `past_due` starts or continues a local `grace_period` status with `grace_period_ends_at` set to seven days after the failed-payment transition unless an earlier policy end already exists.
- `grace_period` retains paid web and podcast access until `grace_period_ends_at`.
- `unpaid` loses paid access immediately unless the subscription is still inside the recorded local grace window.
- `canceled` keeps paid access until the paid `current_period_end` or local `access_ends_at`.
- `expired` loses paid access immediately.

Rationale:

Seven days gives legitimate subscribers time to fix payment failures without a surprising loss of web or podcast access. Applying the same duration to both surfaces keeps support scripts and entitlement tests simple, while local state prevents Stripe redirects or client state from becoming access authority.

Follow-up/verification:

- Subscription entitlement tests must cover `past_due`, `grace_period`, `unpaid`, `canceled`, and `expired` for web and podcast access before billing goes live.
- Support copy should describe that access may continue briefly after a failed payment and ends after the grace period if payment is not recovered.

## 2026-07-10: Launch podcast product model

Owner: QSCM product/engineering  
Affected issues: #4, #7

Decision:

- Launch with one private podcast show.
- Paid tiers map to episode visibility and episode access rules inside that one show, rather than separate tier-specific shows.
- A subscriber receives one private RSS feed URL for the show. Feed generation includes only episodes the subscriber is entitled to access.
- Episode visibility supports `paid_any` and `specific_tiers` at launch. Future public previews can be represented as episode metadata or public post/show-note content.
- Defer tier-specific shows until there is a clear editorial or packaging need.

Rationale:

One show gives subscribers a simpler podcast-app experience and reduces feed-token, artwork, metadata, and support complexity. Tier-filtered episodes preserve product flexibility without multiplying shows before the content strategy proves the need.

Follow-up/verification:

- Migration path for future tier-specific shows: add new `podcast_shows`, issue show-specific feed tokens, migrate or duplicate selected episodes, keep old GUIDs stable where possible, and communicate any new feed URLs before retiring the shared show.
- Feed generation tests should verify that tier-filtered episodes are excluded before RSS items and enclosure URLs are returned.

## 2026-07-10: Geography, currency, and tax launch scope

Owner: QSCM product/engineering  
Affected issues: #5, #7

Decision:

- Launch paid subscriptions in the United States only.
- Launch currency is USD only.
- Configure checkout, prices, receipts, and customer messaging around US/USD at launch.
- Evaluate and configure Stripe Tax before any live paid charges. Do not process live paid subscription charges until the tax decision, collection settings, and customer address requirements are verified.
- Unsupported geographies should receive clear messaging that paid subscriptions are not available in their country yet; free/public content can remain available unless legal, compliance, or product decisions later restrict it.
- Defer localization, additional currencies, and non-US tax collection until after launch.

Rationale:

US/USD narrows pricing, tax, support, and compliance risk for the first live release. Stripe Tax evaluation before live charges prevents accidental under-collection or unsupported tax behavior once paid checkout opens.

Follow-up/verification:

- Before launch, verify Stripe account country, price currency, checkout address collection, tax settings, receipt language, and unsupported-country messaging.
- Future expansion should add a new decision entry covering supported countries, currencies, tax registration/collection behavior, and customer messaging.

## 2026-07-10: Email broadcast ownership

Owner: QSCM product/engineering  
Affected issues: #6, #7

Decision:

- Resend is the launch email provider, but broadcast ownership lives in the app.
- Newsletter/broadcast content is generated from app-owned Markdown/MDX posts and metadata.
- The app creates and approves broadcast send intents; Resend sends the resulting email payload.
- Every transactional and broadcast send path must reserve a local `send_intent` with a stable dedupe key before calling Resend.
- Duplicate attempts with the same dedupe key must be skipped or reported as already handled, not sent again.
- Launch-blocking send flows: account/auth email, billing/subscription transactional email, and approved newsletter broadcasts generated from MDX.
- Deferred send flows: provider-UI-authored broadcasts, complex marketing automations, A/B testing, and Kit/CRM-driven campaigns.

Rationale:

Keeping app-generated MDX as the content source of truth avoids split-brain publishing between Git, the app, and provider UI. Local `send_intent` dedupe protects subscribers from duplicate sends when jobs retry, provider calls time out, or an operator clicks twice.

Follow-up/verification:

- Implement database-backed `send_intent` uniqueness before production sends.
- Verify every send path uses the same dedupe contract before enabling live broadcasts.
- Keep Resend segments/contact sync downstream of app subscriber and entitlement state.
