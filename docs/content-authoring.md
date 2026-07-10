# Content Authoring

Posts are authored as Markdown or MDX files. The file is the source of truth for the post body and frontmatter; app routes and future database indexes should read from these files rather than replacing them.

## Add a Post

1. Create a file in `content/posts`.
2. Use `.md` for plain Markdown or `.mdx` when the post needs MDX features.
3. Add YAML frontmatter at the top of the file.
4. Write the post body below the closing `---`.
5. Commit the file with the rest of the site changes.

Any editor works as long as it saves a normal text file.

```mdx
---
title: "Welcome to the archive"
slug: "welcome-to-the-archive"
excerpt: "A short description used in lists and metadata."
publishedAt: "2026-07-09"
author: "QSCM"
status: "published"
visibility: "public"
tags:
  - updates
coverImage:
  src: "/media/qscm-cover.svg"
  alt: "QSCM editorial cover artwork"
seo:
  title: "Welcome to the archive"
  description: "A public post example with search metadata."
media:
  - src: "/media/qscm-cover.svg"
    kind: "image"
    alt: "QSCM editorial cover artwork"
---

Write the post here.
```

## Frontmatter Fields

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| `title` | Yes |  | Post title shown on list and detail pages. |
| `slug` | Yes |  | URL slug for `/posts/[slug]`. Keep it stable after publishing. |
| `excerpt` | Yes |  | Short summary used in lists and page metadata. |
| `publishedAt` | Yes |  | Publish date. Use an ISO date such as `2026-07-09`. |
| `author` | No | `QSCM` | Display author. |
| `status` | No | `published` | Use `draft` to keep a post out of normal routes and lists. |
| `visibility` | No | `public` | Access level for the post. |
| `publicationId` | No |  | Optional publication identifier for future multi-publication indexes. |
| `tierIds` | No | `[]` | Tier identifiers used when `visibility` is `specific_tiers`. |
| `tags` | No | `[]` | Search, filtering, or index tags. |
| `updatedAt` | No |  | Optional last-updated date. |
| `canonicalUrl` | No |  | Optional canonical URL if the canonical version lives elsewhere. |
| `coverImage` | No |  | Optional `{ src, alt, caption }` image shown above the post body. |
| `seo` | No | `{}` | Optional `title`, `description`, `canonicalUrl`, and `image` overrides for metadata. |
| `newsletter` | No |  | Optional email-broadcast metadata for posts that should create a newsletter broadcast. |
| `media` | No | `[]` | Optional list of media references used by the post. Image entries require `alt`. |

Invalid frontmatter fails the build with the source file and field names. Slugs
must use lowercase letters, numbers, and hyphens.

Optional newsletter metadata is intentionally narrow and does not change content
access rules:

```mdx
newsletter:
  enabled: true
  subject: "Optional email subject"
  previewText: "Optional inbox preview"
  audience: "free_subscribers"
```

When omitted or disabled, no broadcast is created from the post.

## Visibility

`visibility` controls the access requirement derived from frontmatter:

| Value | Access requirement |
| --- | --- |
| `public` | Anyone can read the post. |
| `free_subscribers` | A signed-in free subscriber is required. |
| `paid_any` | Any paid subscription is required. |
| `specific_tiers` | A paid subscription in one of the listed `tierIds` is required. |

Post access is decided on the server before rendering the MDX body. When a
reader is not allowed to read a restricted post, the route renders a locked
state from the title, excerpt, and access rule only; the restricted body is not
passed to MDX rendering.

Example tier-restricted frontmatter:

```mdx
---
title: "Member briefing"
slug: "member-briefing"
excerpt: "A note for selected tiers."
publishedAt: "2026-07-09"
visibility: "specific_tiers"
tierIds:
  - pro
  - founding-member
---
```

## Drafts, Scheduled Posts, and Routes

Published posts are included in `/posts`, `/posts/[slug]`, and static slug
generation only when `publishedAt` is not in the future. Draft posts and
scheduled posts remain readable by the file loader only when callers explicitly
request unpublished content, so authors can keep unfinished work in the
repository without changing public routes.

Use these combinations:

| Intent | `status` | `publishedAt` |
| --- | --- | --- |
| Public now | `published` | Now or earlier |
| Scheduled | `published` | Future date/time |
| Draft | `draft` | Any date |

## Preview Skeleton

The preview endpoint is available at
`/api/preview?secret=<PREVIEW_SECRET>&slug=<post-slug>`. It enables Next draft
mode and then redirects to the post route, where the same production post
component renders unpublished content.

This is a skeleton until admin permissions are attached. Do not share preview
secrets broadly, and do not treat this as a complete editorial authorization
system.

Disable preview mode with `/api/preview/disable`.

## Media References

Local media lives under `public/` and is referenced from MDX or frontmatter with
absolute paths such as `/media/qscm-cover.svg`. Remote media must use an
`http://` or `https://` URL.

Supported patterns:

```mdx
![QSCM editorial cover](/media/qscm-cover.svg)

<audio src="/media/member-briefing.mp3" />

<video src="/media/walkthrough.mp4" />
```

Local references in `coverImage`, `seo.image`, `media`, Markdown images, MDX
`audio`/`video`/`source`/`track`/`img` tags, video posters, media-like download
links, static page media, and local `embed`/`iframe`/`object` references are
checked during the build. Missing files fail clearly instead of silently
publishing broken media. Private `media-private://` assets are blocked from
public MDX.

Links to downloadable files such as PDF, ZIP, CSV, DOCX, PPTX, and XLSX render
as stable download links.

See `docs/media-storage.md` for upload registration, private media, CDN, and
retention policy details.

## Static Inner Pages

Simple static pages are MDX files in `content/pages`. They do not require a
WYSIWYG editor and render at `/<slug>`.

```mdx
---
title: "About QSCM"
slug: "about"
excerpt: "A static page authored in MDX."
seo:
  title: "About QSCM"
  description: "Learn about QSCM."
---

Write the page body here.
```

The `seo` fields drive static page metadata.

## Fixtures

Current fixtures cover the main states:

| File | Purpose |
| --- | --- |
| `content/posts/welcome.mdx` | Public post with cover image, SEO, and media references. |
| `content/posts/free-subscriber-note.mdx` | Free subscriber visibility. |
| `content/posts/paid-foundation.mdx` | Paid subscriber visibility. |
| `content/posts/scheduled-briefing.mdx` | Scheduled post hidden from public output. |
| `content/posts/draft-lab-note.mdx` | Draft post hidden from public output. |
| `content/pages/about.mdx` | Static inner page pattern. |
