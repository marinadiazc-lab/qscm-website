# Media Storage And Delivery

M11 introduces a media domain for images, downloads, audio, video, transcripts,
and private/admin files.

## Provider Decision

Production should use Vercel Blob as the first provider choice because the site
already deploys on Vercel, Blob gives stable public URLs, CDN delivery, and
server-side upload support without adding another cloud account. An
S3-compatible adapter remains the fallback if QSCM later needs lifecycle rules,
regional storage control, or existing bucket governance.

No production storage credentials are committed. Local development uses the
`local` provider.

Environment variables:

```bash
MEDIA_STORAGE_PROVIDER=local
```

Future production variables for Vercel Blob should be configured in Vercel, not
in git:

```bash
MEDIA_STORAGE_PROVIDER=vercel_blob
BLOB_READ_WRITE_TOKEN=...
```

The production container naming convention should be `qscm-media-production`.
Preview and local environments should use `qscm-media-preview` and local
filesystem storage respectively.

## Upload Registration

Admin uploads post to `/api/admin/media` as multipart form data:

- `publicationId`: required publication UUID
- `file`: required upload
- `access`: `public`, `admin`, or `entitled`; defaults to `public`
- `altText`: required for images
- `title`: optional display title
- `durationSeconds`: optional audio/video duration for podcast/RSS metadata

The service validates MIME types, stores a checksum, records size, stable path,
provider object key, image dimensions where detectable, and audio/video duration
when supplied. Unsupported file types are rejected.

Local public uploads are written under `public/media/<publication>/<yyyy-mm>/`.
Admin and entitled uploads receive a non-public `media-private://` stable path
and no `publicUrl`.

## MDX And Static Content

MDX and frontmatter media references must use either:

- an absolute local path under `public/`, such as `/media/qscm-cover.svg`
- an `http://` or `https://` URL

Posts and static pages validate Markdown images, MDX `img`, `audio`, `video`,
`source`, `track`, video posters, and media-like download links at build time.
Broken local files fail the build instead of silently publishing a dead link.
Private `media-private://` references are blocked from public MDX rendering.

Download links to files like PDF, ZIP, CSV, DOCX, PPTX, and XLSX render as
downloadable file links with stable URLs.

## Audio, Video, And Podcast Enclosures

Audio and video assets store MIME type, byte length, checksum, and optional
duration. Podcast RSS helpers can build enclosure metadata from registered audio
assets, including URL, MIME type, length, duration, delivery mode, object key,
and checksum.

Local duration extraction is not automatic yet. Authors or admin tooling should
provide `durationSeconds` during registration until a production media analyzer
is added.

## CDN And Cache Behavior

Local development serves public files through Next's static file handling.
Production public media should be delivered by Vercel Blob CDN-backed URLs.
Public media object keys include a checksum prefix, so updates should create a
new stable path rather than mutating cached bytes in place.

Podcast audio URLs used in RSS must be stable and externally reachable by
podcast clients. Private RSS feed access is token-gated separately; strict
signed audio URLs are documented as the future mode for higher-security private
audio.

## Private/Admin Media

Admin-only and entitled media are explicitly not written to public URLs by the
local provider. The current route requires an authenticated admin before upload.

Full entitled media delivery still needs a signed delivery route integrated with
subscription entitlement checks. Until that exists, private assets must not be
embedded in public MDX or exposed as public URLs.

Logs and responses should prefer asset IDs, stable public paths, and object keys
over raw private delivery URLs.

## Cleanup And Retention

The media repository can identify, but does not automatically delete, retention
candidates:

- archived media older than 30 days
- public media not referenced for 180 days

Destructive deletion should require an admin confirmation step and an audit log
entry. This code intentionally stops at identification because production object
storage credentials and final admin UX are not present in this repository.
