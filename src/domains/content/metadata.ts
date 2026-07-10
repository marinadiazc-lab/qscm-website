import { derivePostAccessRequirement } from "./access";
import type { PostFrontmatter, PostMetadataIndexEntry } from "./types";

export function createPostMetadataIndexEntry(
  frontmatter: PostFrontmatter,
  sourcePath: string,
  now = new Date(),
): PostMetadataIndexEntry {
  return {
    slug: frontmatter.slug,
    sourcePath,
    title: frontmatter.title,
    excerpt: frontmatter.excerpt,
    author: frontmatter.author,
    status: frontmatter.status,
    publicationState:
      frontmatter.status === "draft"
        ? "draft"
        : frontmatter.publishedAt.getTime() > now.getTime()
          ? "scheduled"
          : "published",
    visibility: frontmatter.visibility,
    accessRequirement: derivePostAccessRequirement(frontmatter),
    publishedAt: frontmatter.publishedAt,
    publicationId: frontmatter.publicationId,
    tierIds: [...frontmatter.tierIds],
    tags: [...frontmatter.tags],
    updatedAt: frontmatter.updatedAt,
    canonicalUrl: frontmatter.canonicalUrl,
    coverImage: frontmatter.coverImage,
    seo: frontmatter.seo,
    newsletter: frontmatter.newsletter,
    media: [...frontmatter.media],
  };
}
