# Private Podcast Domain

Status: initial skeleton
Date: 2026-07-09

## Delivery Model

Private podcast feeds use a bearer-token RSS URL. The token identifies a subscriber or user, is stored server-side as a hash, and gates the feed listing before any episode metadata or enclosure URLs are returned.

The first implementation is compatibility-first:

- Podcast apps receive normal RSS items and normal enclosure URLs.
- The private RSS token is the access check for the feed document.
- Audio enclosure URLs point at stable CDN URLs with obscure object paths.
- Episode access still consults local entitlement state before an item is included in the feed.

This keeps Apple Podcasts, Overcast, Pocket Casts, and similar clients on the simplest path. Many podcast apps cache aggressively, retry requests without custom headers, and do not consistently support short-lived signed enclosure URLs.

## Rotation and Revocation

Tokens have explicit lifecycle states: `active`, `revoked`, `rotated`, and `expired`.

- `active` tokens can be used until their optional expiry time.
- `revoked` tokens are denied immediately and should be used for subscriber support, abuse response, or account closure.
- `rotated` tokens are denied after a replacement token is issued, allowing old feed URLs to be invalidated without deleting audit history.
- `expired` tokens are denied when the stored status or expiry timestamp says access has ended.

Access attempts should be recorded as token audit or access events with the token id, show id, optional episode id, result, reason, timestamp, and request context when available.

## Why Strict Signed Audio Is Deferred

Strict signed audio URLs provide tighter control, but they are brittle for private RSS. Podcast clients often cache enclosure URLs, download episodes hours or days later, and re-fetch files from different infrastructure than the feed request. Short expirations can create false support issues for legitimate subscribers.

The safer initial boundary is: bearer-token RSS for listing access, entitlement checks before item inclusion, and stable CDN/obscure audio URLs for playback compatibility. The domain types still include a `strict_signed_audio_url` delivery mode so the platform can move individual shows or episodes toward stricter audio enforcement later.
