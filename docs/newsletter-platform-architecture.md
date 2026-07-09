# Paid Newsletter Platform Architecture

Status: planning draft  
Date: 2026-07-09  
Current repository state: static Hello World site with no framework, database, auth, CMS, or production app structure.

## A. Current Product Decisions

These decisions should guide implementation unless changed later:

- Start as one publication, but keep the data model ready for multiple publications later.
- Posts are authored as Markdown/MDX files. Those files are the source of truth and the site compiles from them.
- Static/inner pages can use richer implementation formats such as JSX, HTML, or route components.
- Do not build a WYSIWYG editor for posts in the first architecture.
- Email provider default is Resend, behind an `EmailProvider` abstraction. Kit can remain a later adapter if needed.
- Paid cancellations keep access until the paid period ends.
- Failed-payment access is a local entitlement policy derived from Stripe subscription state, not blindly delegated to Stripe redirects.
- Comments publish immediately by default; spam/rate limits apply, and AI moderation can be added later.
- Private podcast delivery should be compatibility-first: private RSS feed tokens plus obscure CDN audio URLs.
- Auth should support Google, Facebook, Apple, and magic-link email.

Remaining important questions:

1. Who owns editorial operations: one admin, a small team with roles, or many authors/editors?
2. Is private podcast access one show for all paid users, tier-specific shows, or one show with tier-filtered episodes?
3. Will the site need custom domains, localization, or multiple currencies in the first year?
4. What exact failed-payment grace period should be used for web access and podcast access?

## B. Proposed Technical Architecture

Use a monolithic web app with clear internal service boundaries, not microservices. The product needs tight coordination between content, auth, subscriptions, comments, email sync, and private podcast entitlements. A modular monolith keeps transactions and authorization simpler while still allowing pieces to be extracted later.

Recommended shape:

- Web app: Next.js App Router on Vercel.
- Runtime: TypeScript.
- Database: Postgres via Vercel Marketplace integration such as Neon, Supabase Postgres, or AWS Aurora.
- ORM/query layer: Drizzle for explicit schema and SQL-friendly migrations. Prisma is also acceptable if the team strongly prefers it.
- Auth: Better Auth or Auth.js with OAuth providers for Google, Facebook, and Apple, plus magic-link email. Use database-backed sessions or durable session storage, not stateless-only assumptions for admin workflows.
- Billing: Stripe Checkout for initial purchase, Stripe Customer Portal for self-service billing, app-local subscription state as source of truth for access.
- Email: Resend through an `EmailProvider` abstraction. Resend handles transactional email and newsletter/broadcast delivery; the app remains the source of truth for users, subscribers, and entitlements.
- Content: Markdown/MDX files for posts, compiled at build time or through static regeneration. Store only dynamic overlays in the database: access rules, comments, likes, subscribers, billing, and email sync state.
- Media: object storage plus CDN. Prefer S3-compatible storage or Vercel Blob for general files. For podcast audio, start with stable HTTPS CDN URLs using obscure object keys because podcast app compatibility is more important than strict media DRM at launch.
- Rate limiting/queues: Redis-compatible store such as Upstash for rate limits and lightweight jobs. Use a real background job runner later if publishing/sync grows.
- Admin/editorial: built into the app initially for dynamic operations such as subscribers, comments, tiers, access grants, and media. Post authoring remains file-based.

High-level modules:

- `content`: Markdown/MDX posts, pages, podcast episodes, media.
- `identity`: users, OAuth accounts, sessions, roles.
- `subscriptions`: tiers, access grants, entitlements.
- `billing`: Stripe checkout, portal, webhooks, reconciliation.
- `email`: Resend sync, transactional email, and newsletter-send coordination.
- `podcast`: private RSS tokens, feed generation, episode entitlement checks.
- `engagement`: likes, comments, moderation, sharing.
- `admin`: editorial and subscriber management surfaces.

## C. Recommended Stack and Current Repo Evaluation

The current repo is only a static Vercel deployment. That is fine for the placeholder, but it is not a meaningful stack for this product. Do not bolt auth, Stripe, comments, or feeds onto the static page.

Recommended stack:

- Next.js App Router, TypeScript, React Server Components, and server actions for simple form mutations.
- Markdown/MDX post pipeline with frontmatter, build-time compilation, and optional static regeneration.
- Postgres for relational product data.
- Drizzle ORM for schema-first database modeling.
- Better Auth as first choice if its OAuth/account-linking model fits the desired flow; Auth.js as fallback if the team wants the mature Next.js adapter ecosystem. Avoid writing custom OAuth.
- Stripe Billing, Checkout, Customer Portal, and webhooks.
- Resend API through a provider wrapper. Keep the interface generic enough to add Kit later if product needs shift toward creator CRM/automation.
- S3-compatible storage or Vercel Blob for assets; CDN in front of audio/media.
- Upstash Redis for rate limiting, locks, and simple queues.
- A minimal built-in admin for operations. Do not build a post WYSIWYG editor.

Post content strategy:

- Posts live in files, for example `content/posts/my-post.mdx`.
- Frontmatter carries static metadata: slug, title, excerpt, author, publish date, cover image, SEO fields, and default visibility.
- The compiled site reads posts from the filesystem and renders them statically where possible.
- The database stores dynamic overlays that cannot live safely in Git: comments, likes, subscriber state, Stripe state, private feed tokens, email sends, and optional access-rule overrides.
- This keeps writing portable and editor-agnostic while still supporting paid access and engagement.

Why not a headless CMS first:

- A CMS adds another source of truth early.
- The requested workflow is file-authored posts, not browser-authored posts.
- Admin effort should go toward subscribers, billing, comments, access grants, and media management first.

## D. Data Model / Database Schema Proposal

Use UUID primary keys unless there is a strong reason not to. Include `created_at`, `updated_at`, and soft-delete or archival fields where operationally useful.

### Publications

`publications`

- `id`
- `slug`
- `name`
- `description`
- `primary_domain` nullable
- `status`: `active`, `archived`
- `default_locale`
- timestamps

Start with one row. Add `publication_id` to content, tiers, subscribers, podcast shows, and admin roles where practical so multi-publication support can be added without a full rewrite.

### Identity and Accounts

`users`

- `id`
- `email`
- `email_verified_at`
- `display_name`
- `avatar_url`
- `role`: `reader`, `author`, `editor`, `admin`
- `status`: `active`, `disabled`, `deleted`
- `primary_subscriber_id`
- timestamps

`auth_accounts`

- `id`
- `user_id`
- `provider`: `google`, `facebook`, `apple`, `email_magic_link`, later others
- `provider_account_id`
- `provider_email`
- `provider_email_verified`
- OAuth token metadata if the auth library requires it
- unique `(provider, provider_account_id)`

`sessions`

- library-managed, but ensure user, expiry, token hash/session id, user agent, and IP metadata are available enough for security review.

`account_link_requests`

- `id`
- `user_id`
- `provider`
- `provider_account_id`
- `status`
- `expires_at`
- audit fields

### Subscribers and Access

`subscribers`

- `id`
- `publication_id`
- `user_id` nullable, because a free email subscriber may not have a login yet
- `email`
- `name`
- `status`: `active`, `unsubscribed`, `bounced`, `complained`, `suppressed`
- `source`
- `email_provider_contact_id`
- timestamps
- unique normalized email per publication

`paid_tiers`

- `id`
- `publication_id`
- `slug`
- `name`
- `description`
- `status`: `active`, `archived`
- `sort_order`
- `default_grace_period_days`
- feature flags such as `includes_private_podcast`

`tier_prices`

- `id`
- `tier_id`
- `billing_interval`: `month`, `year`
- `amount`
- `currency`
- `is_enabled_for_new_checkout`
- `stripe_price_id`
- `stripe_product_id`
- timestamps

Rule for disabled intervals: disabling monthly or annual billing stops new checkout, upgrade, or downgrade selection for that interval. Existing subscriptions remain valid on their current Stripe price until canceled, changed by the subscriber, migrated by an explicit admin action, or ended by policy. Never delete historical prices.

`subscriptions`

- `id`
- `subscriber_id`
- `user_id` nullable
- `tier_id` nullable for free subscriptions
- `source`: `stripe`, `free`, `gift`, `admin_comp`, `migration`
- `status`: `free`, `trialing`, `active`, `past_due`, `grace_period`, `canceled`, `expired`, `unpaid`, `comped`
- `billing_interval`: `month`, `year`, nullable
- `current_period_start`
- `current_period_end`
- `cancel_at_period_end`
- `canceled_at`
- `grace_period_ends_at`
- `access_starts_at`
- `access_ends_at`
- timestamps

`subscription_entitlements`

- `id`
- `subscription_id`
- `entitlement_key`: `paid_content`, `tier:pro`, `podcast:main`, `addon:name`
- `starts_at`
- `ends_at`
- `source`

`free_subscriptions`

- `id`
- `subscriber_id`
- `status`
- timestamps

`gift_subscriptions`

- `id`
- `giver_subscriber_id`
- `recipient_email`
- `recipient_subscriber_id` nullable
- `tier_id`
- `duration_months`
- `stripe_checkout_session_id` nullable
- `redeemed_at`
- `expires_at`
- `status`

`admin_access_grants`

- `id`
- `subscriber_id`
- `tier_id`
- `granted_by_user_id`
- `reason`
- `starts_at`
- `ends_at`
- `revoked_at`

### Stripe Mapping

`stripe_customers`

- `id`
- `subscriber_id`
- `user_id` nullable
- `stripe_customer_id`
- unique `stripe_customer_id`

`stripe_products`

- `id`
- `stripe_product_id`
- `tier_id`
- `status`
- raw metadata snapshot

`stripe_prices`

- `id`
- `stripe_price_id`
- `tier_price_id`
- `billing_interval`
- `currency`
- `amount`
- `active`
- raw metadata snapshot

`stripe_subscriptions`

- `id`
- `subscription_id`
- `stripe_subscription_id`
- `stripe_customer_id`
- `stripe_status`
- `latest_invoice_id`
- `current_period_start`
- `current_period_end`
- `cancel_at_period_end`
- `canceled_at`
- `raw_snapshot`
- `last_synced_at`

`coupons`

- `id`
- `code`
- `stripe_coupon_id`
- `stripe_promotion_code_id`
- `discount_type`: `percent`, `amount`, `trial`
- `duration`
- `applies_to_tier_id` nullable
- `starts_at`
- `ends_at`
- `max_redemptions`
- `status`

`discount_redemptions`

- `id`
- `coupon_id`
- `subscriber_id`
- `subscription_id`
- `stripe_discount_id`
- `redeemed_at`

### Content

`posts`

- `id`
- `publication_id`
- `slug`
- `title`
- `excerpt`
- `content_path`
- `content_hash`
- `frontmatter`
- `author_id`
- `status`: `draft`, `scheduled`, `published`, `archived`
- `visibility`: `public`, `free_subscribers`, `paid_any`, `specific_tiers`
- `published_at`
- `scheduled_for`
- `seo_title`
- `seo_description`
- `cover_media_id`
- timestamps

This table is an index/cache of file-authored posts, not the source of truth for post body content. The source of truth is the Markdown/MDX file. The database row supports search, access rules, engagement joins, and admin visibility.

`post_access_rules`

- `id`
- `post_id`
- `rule_type`: `public`, `free_subscriber`, `paid_any`, `tier`, `addon`
- `tier_id` nullable
- `starts_at`
- `ends_at`

`static_pages`

- `id`
- `publication_id`
- `slug`
- `title`
- `body`
- `body_format`: `jsx_route`, `html`, `markdown`, `rich_text`
- `status`
- `seo_title`
- `seo_description`
- timestamps

`media_assets`

- `id`
- `storage_provider`
- `bucket`
- `object_key`
- `public_url` nullable
- `mime_type`
- `size_bytes`
- `duration_seconds` nullable
- `width` nullable
- `height` nullable
- `alt_text`
- `caption`
- `visibility`: `public`, `unlisted`, `entitled`, `private_admin`
- `uploaded_by_user_id`
- timestamps

### Podcast

Recommend podcast episodes as a separate content type, with optional linked post/show-notes. Tradeoff: a post subtype is simpler at first, but podcast RSS needs stable GUIDs, enclosure metadata, durations, feed ordering, transcript fields, host/author data, and entitlement behavior that differ enough from posts to justify separation.

`podcast_shows`

- `id`
- `publication_id`
- `slug`
- `title`
- `description`
- `cover_art_media_id`
- `language`
- `author`
- `explicit`
- `category`
- `copyright`
- `owner_email`
- `status`
- timestamps

`podcast_episodes`

- `id`
- `show_id`
- `linked_post_id` nullable
- `slug`
- `guid`
- `title`
- `description`
- `show_notes`
- `publication_date`
- `duration_seconds`
- `audio_media_id`
- `transcript_media_id` nullable
- `visibility`: `public_preview`, `free_subscribers`, `paid_any`, `specific_tiers`
- `author_or_host`
- `seo_title`
- `seo_description`
- `status`: `draft`, `scheduled`, `published`, `archived`
- timestamps

`podcast_episode_access_rules`

- `id`
- `episode_id`
- `rule_type`: `public_preview`, `free_subscriber`, `paid_any`, `tier`, `addon`
- `tier_id` nullable

`private_podcast_feed_tokens`

- `id`
- `subscriber_id`
- `show_id`
- `token_hash`
- `token_prefix`
- `status`: `active`, `revoked`, `rotated`
- `created_at`
- `last_used_at`
- `last_used_ip_hash`
- `rotated_at`
- `revoked_at`
- `expires_at` nullable

Only store a hash of the full feed token. Show the full token once at generation/regeneration time.

### Engagement and Email

`likes`

- `id`
- `post_id`
- `user_id` nullable
- `subscriber_id` nullable
- `anonymous_fingerprint_hash` nullable
- timestamps
- enforce uniqueness per actor/post

`comments`

- `id`
- `post_id`
- `parent_comment_id` nullable
- `user_id` nullable
- `commenter_name`
- `commenter_email_hash`
- `commenter_email_encrypted`
- `commenter_website_url_encrypted` nullable
- `body`
- `status`: `approved`, `pending`, `rejected`, `spam`, `deleted`
- `moderation_source`: `none`, `manual`, `ai`, `system`
- `moderated_by_user_id` nullable
- `moderated_at` nullable
- `ip_hash`
- `user_agent_hash`
- timestamps

`email_share_events`

- `id`
- `post_id`
- `sender_user_id` nullable
- `sender_email_hash` nullable
- `recipient_email_hash`
- `recipient_email_encrypted`
- `status`: `queued`, `sent`, `failed`, `blocked`
- `provider_message_id` nullable
- timestamps

`email_provider_sync_state`

- `id`
- `subscriber_id`
- `provider`: `resend`, `kit`, later others
- `provider_contact_id`
- `last_synced_at`
- `last_sync_status`
- `last_error`
- `desired_segments`
- `synced_segments`
- `desired_custom_fields`
- `synced_custom_fields`

`webhook_event_logs`

- `id`
- `provider`: `stripe`, `resend`, `kit`
- `event_id`
- `event_type`
- `received_at`
- `processed_at`
- `processing_status`: `received`, `processed`, `failed`, `ignored`
- `attempt_count`
- `payload_hash`
- `payload_snapshot`
- `error_message`
- unique `(provider, event_id)`

## E. Suggested Folder / Module Structure

```text
src/
  app/
    (public)/
      page.tsx
      posts/
      [slug]/
    account/
    admin/
    api/
      auth/
      stripe/webhook/
      resend/webhook/
      podcast/[showSlug]/[token]/rss.xml/
  content/
    posts/
      example-post.mdx
    pages/
  components/
    content/
    account/
    admin/
    forms/
  db/
    schema/
    migrations/
    client.ts
  domains/
    auth/
    billing/
    subscriptions/
    content/
    podcast/
    email/
    media/
    comments/
    moderation/
    webhooks/
  content/
    posts/
      loader.ts
      compile.ts
      frontmatter.ts
  lib/
    config/
    crypto/
    rate-limit/
    validation/
  tests/
    unit/
    integration/
```

Each domain should expose service functions and repositories. UI should call domain services, not raw Stripe/Resend/database code.

## F. Major Service Boundaries

`AuthService`

- OAuth sign-in/sign-out.
- Magic-link email sign-in.
- Account linking.
- Session lookup.
- Admin role checks.

`BillingService`

- Creates Stripe Checkout sessions.
- Creates Billing Portal sessions.
- Maps internal tiers/prices to Stripe products/prices.
- Avoids trusting client redirect outcomes.

`SubscriptionService`

- Maintains local subscription and entitlement state.
- Answers access questions for posts, podcast episodes, and admin tools.
- Applies grace-period and cancellation policy.

`StripeWebhookService`

- Verifies signatures.
- Logs every event idempotently.
- Processes subscription/customer/invoice/checkout events.
- Reconciles out-of-order events by fetching current Stripe objects when needed.

`PodcastFeedService`

- Generates RSS XML per subscriber token.
- Filters episodes by entitlement.
- Rotates/revokes tokens.
- Emits cache headers carefully so private feeds are not globally cached.

`PodcastEntitlementService`

- Determines whether a token can see a show/episode/audio URL.
- Applies cancellation and failed-payment policy.

`MediaService`

- Uploads assets.
- Tracks metadata.
- Provides public or tokenized URLs depending on asset type.

`EmailProvider`

- Interface: create/update contact, assign/remove segment or audience membership, set custom fields, send transactional email, create/send broadcasts if needed.
- `ResendEmailProvider` implementation first.
- Keep `KitEmailProvider` possible later, but do not make Kit concepts leak into domain code.

`ContentService`

- Loads and compiles Markdown/MDX posts from files.
- Indexes frontmatter into the database when needed.
- Handles static pages and podcast episode metadata.
- Keeps post body content file-authored, not WYSIWYG-authored.

`CommentsService`

- Creates comments as approved by default unless spam/rate checks fail.
- Applies spam checks, rate limits, and optional future AI moderation.
- Keeps commenter email private.

`ModerationService`

- Queues comments.
- Handles approve/reject/spam/delete.
- Maintains audit trail.

## G. API Routes or Server Actions Needed

Auth:

- `GET/POST /api/auth/*` from auth library.
- `POST /account/link-provider`
- `POST /account/unlink-provider`

Subscriptions and billing:

- `POST /subscribe/free`
- `POST /checkout`
- `POST /billing/portal`
- `POST /api/stripe/webhook`
- `POST /admin/subscribers/:id/grant-access`
- `POST /admin/subscribers/:id/revoke-access`

Content access:

- `GET /posts`
- `GET /posts/:slug`
- `GET /api/posts/:id/access` only if client-side checks are needed; otherwise do checks on server render.

Engagement:

- `POST /posts/:id/like`
- `DELETE /posts/:id/like`
- `POST /posts/:id/comments`
- `POST /posts/:id/share-email`

Private podcast:

- `GET /podcast/:showSlug/:token/rss.xml`
- `POST /account/podcast/:showId/regenerate-token`
- `POST /account/podcast/:showId/revoke-token`
- Optional later: `GET /podcast/media/:token/:episodeId/audio` if proxying/tokenizing audio becomes necessary despite compatibility costs.

Admin/editorial:

- `GET/POST /admin/posts`
- `GET/PATCH/DELETE /admin/posts/:id`
- `POST /admin/posts/:id/publish`
- `POST /admin/posts/:id/schedule`
- `GET/POST /admin/pages`
- `GET/POST /admin/podcast/shows`
- `GET/POST /admin/podcast/episodes`
- `GET /admin/comments`
- `POST /admin/comments/:id/approve`
- `POST /admin/comments/:id/reject`
- `GET /admin/subscribers`
- `GET/PATCH /admin/subscribers/:id`
- `GET/POST /admin/tiers`
- `PATCH /admin/tiers/:id/prices/:priceId`
- `GET/POST /admin/coupons`

Resend:

- `POST /api/resend/webhook` if using Resend webhooks.
- Internal job/action: `syncSubscriberToEmailProvider(subscriberId)`.

## H. Security Concerns and Handling

OAuth account linking:

- Do not silently merge accounts just because emails match unless the provider's email verification is trusted and the product accepts that risk.
- Prefer explicit linking while signed in.
- Keep unique `(provider, provider_account_id)`.
- Keep a manual admin merge path with audit logs for support.

Stripe webhook verification:

- Verify Stripe signatures against the raw request body.
- Reject unsigned or invalid events.
- Store event ids in `webhook_event_logs` before processing.

Idempotent webhook processing:

- Unique key on `(provider, event_id)`.
- Processing should be safe to retry.
- Use transactions where local subscription state and webhook log state change together.
- For out-of-order events, fetch the canonical Stripe subscription/customer before applying access changes.

Private RSS feed token security:

- Generate high-entropy random tokens.
- Store only hashes.
- Show tokens only once.
- Use rotation and revocation.
- Treat feed URLs as passwords.
- Avoid placing tokens in analytics, referrers, support screenshots, or logs.

Podcast feed URL sharing:

- Perfect DRM is not realistic with podcast RSS.
- Mitigate casual sharing with per-subscriber URLs, token rotation, device/IP anomaly detection, clear account UI, and revocation.
- Avoid aggressive blocking that breaks legitimate podcast apps.

Media URL exposure:

- Public posts can use public media.
- Paid podcast audio must balance security and app compatibility.
- Most podcast apps work best with plain HTTPS enclosure URLs. Signed short-lived URLs can fail because apps cache feeds and download later.
- Default approach: private feed token gates episode listing; audio URLs are CDN URLs with obscure object keys and download anomaly monitoring.
- Optional later approach: longer-lived signed URLs or proxy delivery if abuse justifies the compatibility and cost tradeoff.
- For high-security paid audio, proxy audio through tokenized endpoints, but expect compatibility and cost issues.

Comment spam:

- Rate limit by IP hash, email hash, post, and user.
- Add honeypot fields and invisible timing checks.
- Publish comments immediately when basic checks pass.
- Send suspicious comments to moderation instead of publishing.
- Consider AI moderation/spam scoring later.

Rate limiting:

- Limit auth attempts, comments, likes, email shares, podcast feed requests, and token regeneration.
- Use Redis-backed counters.

Admin authorization:

- Role-based access control.
- Enforce on the server for every admin action.
- Keep audit logs for billing/access/content moderation changes.

PII and email privacy:

- Encrypt commenter emails and recipient emails.
- Store hashes for lookup/deduplication.
- Never render commenter email or website URL publicly unless explicitly enabled later.
- Keep data retention policies for webhook payload snapshots and logs.

## I. Phased Implementation Plan

Phase 1: minimal working free newsletter/blog

- Migrate static site to Next.js and TypeScript.
- Add Markdown/MDX post compilation from `content/posts`.
- Build public index, post pages, and static pages.
- Add Postgres only for dynamic overlays that need it, not as the source of truth for post body content.
- Add a post metadata index/cache if useful for search and joins.

Phase 2: accounts and auth

- Add OAuth sign-in with Google, Facebook, Apple.
- Add magic-link email sign-in.
- Add users, auth accounts, roles, sessions.
- Add explicit account-linking flow.
- Add free subscriber records tied to email and optional user account.

Phase 3: Stripe paid subscriptions

- Add tiers, prices, checkout, portal.
- Add Stripe customer/subscription mapping.
- Implement webhook handling, local subscription state, entitlements, and reconciliation.
- Start with one paid tier and monthly/yearly prices.
- Canceled paid subscriptions retain access until `current_period_end`.
- Failed-payment states map to local entitlement policy with a configurable grace period.

Phase 4: Resend integration

- Add `EmailProvider` interface and `ResendEmailProvider`.
- Sync subscriber status, segments/audiences, tier fields, and unsubscribe state.
- Decide whether broadcasts are created/sent from Resend's UI, from the app, or from API-generated markdown-derived emails.
- Prevent duplicate sends by choosing one owner for each email type.

Recommended default: Resend sends transactional email and newsletter/broadcast email. The app remains the source of truth for subscriber and entitlement state. Every send path gets a `send_intent` record to dedupe.

Phase 5: private podcast foundation

- Add podcast shows, episodes, media assets, feed tokens.
- Generate per-subscriber RSS feeds.
- Add token rotation/revocation UI.
- Implement entitlement filtering and cancellation/grace-period behavior.
- Use compatibility-first audio delivery: private feed tokens plus obscure CDN audio URLs.
- Add compatibility tests with common podcast apps before considering stricter audio security.

Phase 6: comments, likes, and sharing

- Add likes.
- Add comments that publish immediately after basic checks.
- Add spam/rate limiting.
- Add moderation queue for suspicious, reported, or manually held comments.
- Add "send to someone by email" with recipient privacy and abuse limits.

Phase 7: admin/editorial improvements

- Improve admin tooling for post metadata, scheduling, drafts, media library, and SEO fields without making the browser the source of truth for post bodies.
- Add comment moderation tools.
- Add subscriber management and audit history.
- Add role-based editorial workflow.

Phase 8: tier expansion, add-ons, gifts, coupons, advanced states

- Add multiple tiers and tier-specific access rules.
- Add add-ons if truly needed.
- Add gift subscriptions, coupons, trials, comped access.
- Add upgrades/downgrades with proration policy.
- Add richer failed-payment, refund, renewal, and reconciliation tools.

## J. Risky Areas, Assumptions, and Decisions Before Coding

Risky areas:

- OAuth account linking can create privacy/security problems if accounts are merged too aggressively.
- Stripe webhook correctness matters more than checkout redirect UI.
- Podcast RSS privacy is inherently bearer-token based; it cannot provide perfect DRM.
- Signed audio URLs may break podcast app compatibility.
- Resend or Kit can easily become a second source of truth if product access is modeled there.
- Comment spam and email-share abuse need rate limiting from the first public launch.
- Admin comped access, gifts, discounts, trials, refunds, upgrades, and downgrades all affect entitlement logic. Model them as access grants/entitlements, not ad hoc flags.

Settled decisions:

- Keep multi-publication possible, even if the first launch has one publication.
- Posts are Markdown/MDX files as source of truth.
- Paid cancellations keep access until period end.
- Email provider default is Resend, wrapped behind `EmailProvider`.
- Private podcast audio is compatibility-first at launch.
- Comments publish immediately after basic checks.
- Auth includes OAuth plus magic-link email.

Decisions still to make before coding:

- Failed-payment grace-period length.
- Who owns broadcast composition: Resend UI, app UI, or generated email from Markdown posts.
- Whether annual/monthly prices are created manually in Stripe Dashboard or managed from the admin UI.
- Editorial roles and workflow depth for the first admin version.

## Notes From Current Official Docs Checked

- Next.js App Router supports server actions/server functions for mutations and form handling. See [Next.js mutating data](https://nextjs.org/docs/app/getting-started/mutating-data) and [Next.js data security](https://nextjs.org/docs/app/guides/data-security).
- Vercel now connects Postgres through Marketplace providers; Vercel Postgres itself is no longer the new-project default. See [Postgres on Vercel](https://vercel.com/docs/postgres) and [Vercel Storage](https://vercel.com/docs/storage).
- Stripe recommends webhook-based subscription handling, signature verification, and idempotent requests/retries. See [Stripe webhooks](https://docs.stripe.com/webhooks), [Stripe subscriptions overview](https://docs.stripe.com/billing/subscriptions/overview), [subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks), [idempotent requests](https://docs.stripe.com/api/idempotent_requests), and [undelivered webhook processing](https://docs.stripe.com/webhooks/process-undelivered-events).
- Resend supports transactional email, audiences/contacts, and broadcasts through dashboard and API workflows. See [Resend Broadcasts](https://resend.com/docs/dashboard/broadcasts/introduction), [Resend Broadcast API](https://resend.com/blog/broadcast-api), [Resend Audiences](https://resend.com/docs/dashboard/audiences/introduction), and [Resend send broadcast API](https://resend.com/docs/api-reference/broadcasts/send-broadcast).
- Kit remains a viable later adapter if creator CRM/automation becomes more important than app-owned newsletter publishing. See [Kit API overview](https://developers.kit.com/api-reference/overview).
- Apple Podcasts documents RSS requirements and acknowledges private/personalized/password-protected feeds. See [Apple podcast requirements](https://podcasters.apple.com/support/823-podcast-requirements), [private feed distribution notes](https://podcasters.apple.com/support/5108-how-apple-podcasts-distributes-your-shows-to-listeners), and [RSS feed URL/GUID guidance](https://podcasters.apple.com/support/837-change-the-rss-feed-url).
- Auth.js documents OAuth provider support and warns that automatic account linking by email is disabled by default for security. See [Auth.js providers](https://authjs.dev/reference/core/providers) and [Auth.js OAuth](https://authjs.dev/getting-started/authentication/oauth). Better Auth is now the broader auth direction and supports social sign-on. See [Better Auth basic usage](https://better-auth.com/docs/basic-usage) and [Auth.js to Better Auth migration guidance](https://authjs.dev/getting-started/migrate-to-better-auth).
