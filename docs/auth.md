# Auth and Accounts

Status: server auth foundation
Date: 2026-07-10

The auth domain defines the account model, conservative provider-linking decisions, magic-link request lifecycle, durable sessions, and launch role checks. The app routes under `/login`, `/account`, and `/api/auth/*` use this domain directly on the server.

Launch roles are `reader`, `author`, `editor`, `moderator`, `support`, and `admin`. Subscriber access is handled through subscription/entitlement state attached to a reader account, not by assigning a separate staff role.

## Auth foundation selection

M04 selects a first-party Next.js server-cookie foundation instead of Auth.js or Better Auth for this milestone.

Rationale:

- The M01 database already owns users, roles, provider accounts, sessions, magic-link requests, and account-linking audit records.
- The product policy needs conservative account linking; email-match-only merges must not happen silently.
- Provider credentials are not available in the repo, so OAuth routes need safe disabled behavior before a complete callback exchange can be verified.
- Keeping this layer small avoids reshaping existing schema around a library adapter before the app has credentialed OAuth and email delivery environments.

The implementation still follows the same integration boundary an auth library would need: provider config, durable sessions, HTTP-only cookies, server-only current-user lookup, explicit linking decisions, and route guards. If the app later adopts Auth.js or Better Auth, the existing domain decisions and tables should remain the source of truth.

## Environment variables

Database-backed auth routes require `DATABASE_URL`.

Magic-link emails are built from the configured canonical app URL. The app does not trust the inbound request `Origin` header for token links.

URL precedence:

- `AUTH_APP_URL`
- `NEXT_PUBLIC_SITE_URL`
- `VERCEL_PROJECT_PRODUCTION_URL`
- `http://localhost:3000` for local fallback

OAuth providers are disabled unless both credentials for that provider are present:

- `AUTH_GOOGLE_CLIENT_ID`
- `AUTH_GOOGLE_CLIENT_SECRET`
- `AUTH_FACEBOOK_CLIENT_ID`
- `AUTH_FACEBOOK_CLIENT_SECRET`
- `AUTH_APPLE_CLIENT_ID`
- `AUTH_APPLE_CLIENT_SECRET`

Disabled providers appear as unavailable on `/login` and redirect back with a usable error from `/api/auth/oauth/[provider]`.

Configured providers use `/api/auth/oauth/[provider]` to start the authorization-code flow and `/api/auth/oauth/[provider]/callback` to complete it. The start route stores short-lived OAuth state in an HTTP-only cookie and the callback rejects missing, mismatched, or expired state before exchanging the code.

## OAuth linking

OAuth providers are `google`, `facebook`, and `apple`. `email_magic_link` is modeled as an auth provider too, but it is not treated as OAuth.

Provider account linking is conservative by default:

- If the exact provider account is already linked to the signed-in user, the decision is `already_linked`.
- If that provider account is linked to a different user, the decision is `reject`.
- If a signed-in user links a provider whose verified email matches their account email, the decision is `link`.
- If an OAuth sign-in only matches an existing user by email, the decision is `requires_confirmation`; the platform should not silently merge accounts on email alone.
- If the provider email is missing, unverified, or different from the signed-in user's email, the decision requires an explicit confirmation or is rejected.

This lets account settings flows be explicit while preventing unsafe background merges during sign-in.

Signed-in users can start explicit provider linking from `/account` by choosing to link another provider. The callback calls `decideOAuthAccountLink` with the signed-in target user, persists an `account_linking_records` audit row, and only creates the provider account automatically when the provider returns a verified email matching the signed-in user.

Sign-in callbacks for an already-linked active provider account create a durable app session for that account's active user. A linked provider cannot mint a session for a disabled user or an inactive provider account.

OAuth sign-in that discovers an existing app user by verified email but without an already-linked provider account records `requires_confirmation` and does not silently merge. Unverified, mismatched, or missing provider emails are also rejected or routed to explicit confirmation. A future support/admin flow should review the audit record and complete any intentionally approved merge/link.

Provider-specific notes:

- Google and Facebook profiles are fetched from their userinfo endpoints after token exchange.
- Apple profile data is derived from the token response `id_token`; production hardening should verify Apple JWT signatures and claims against Apple's JWKS before launch.
- Provider client IDs/secrets and the canonical `AUTH_APP_URL`/site URL remain external configuration and are not committed to the repo.

Manual/admin account merges should remain a documented support operation: inspect both users, verify ownership out of band, migrate entitlements/feed tokens/comments intentionally, then unlink or disable the duplicate provider account. Do not merge only because two providers return the same email address.

## Magic-link email

Magic-link requests have a lifecycle status of `requested`, `consumed`, `expired`, or `revoked`. A request can only be consumed while it is still `requested` and before `expiresAt`.

The stored token is a SHA-256 hash, not the raw emailed token. `/api/auth/magic-link` creates an expiring request. `/api/auth/magic-link/consume` first claims the token through the repository contract by atomically moving the matching row from `requested` to `consumed` before any user or session is created. If the claim fails, no session is minted. After a successful claim, the route creates or finds a reader user, links the `email_magic_link` account, creates a durable session, stores the session id on the consumed request, and sets the HTTP-only `qscm_session` cookie.

Magic-link email delivery uses the transactional `EmailProvider`/Resend send-intent flow when `RESEND_API_KEY`, `RESEND_DEFAULT_FROM`, and database configuration are available. The route still returns the same safe response whether delivery is queued, skipped as a duplicate, unavailable, or failed.

## Route guards

Use `getCurrentAuthSession` for server-only session lookup and `requireActiveUser`, `requireAuthRole`, or `requireAnyAuthRole` for protected route handlers and future server actions.

`/api/admin/auth-check` is the minimal M04 protected server surface. It requires an active `admin` user and returns 401 for anonymous/disabled users and 403 for active users without the admin role. Broader dashboard UI stays out of this milestone.

Role intent:

- `reader`: account, profile, comments, subscriber content when entitlements allow it
- `author`: authorship attribution and draft ownership
- `editor`: publishing, scheduling, metadata, and author review
- `moderator`: comment queues, spam handling, and moderation audit workflows
- `support`: subscriber, entitlement, feed-token, and billing-support workflows
- `admin`: full operational administration

Role checks also require an active user. Disabled users fail helpers and guards even when their role array still contains a privileged role.
