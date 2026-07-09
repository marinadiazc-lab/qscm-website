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

## Visibility

`visibility` controls the access requirement derived from frontmatter:

| Value | Access requirement |
| --- | --- |
| `public` | Anyone can read the post. |
| `free_subscribers` | A signed-in free subscriber is required. |
| `paid_any` | Any paid subscription is required. |
| `specific_tiers` | A paid subscription in one of the listed `tierIds` is required. |

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

## Drafts and Routes

Published posts are included in `/posts`, `/posts/[slug]`, and static slug generation. Draft posts remain readable by the file loader only when callers explicitly request drafts, so authors can keep unfinished work in the repository without changing public routes.
