import { derivePostAccessRequirement } from "./access";
import type { PostFrontmatter, PostMetadataIndexEntry } from "./types";

export function createPostMetadataIndexEntry(
  frontmatter: PostFrontmatter,
  sourcePath: string,
): PostMetadataIndexEntry {
  return {
    slug: frontmatter.slug,
    sourcePath,
    title: frontmatter.title,
    excerpt: frontmatter.excerpt,
    author: frontmatter.author,
    status: frontmatter.status,
    visibility: frontmatter.visibility,
    accessRequirement: derivePostAccessRequirement(frontmatter),
    publishedAt: frontmatter.publishedAt,
    publicationId: frontmatter.publicationId,
    tierIds: [...frontmatter.tierIds],
    tags: [...frontmatter.tags],
    updatedAt: frontmatter.updatedAt,
    canonicalUrl: frontmatter.canonicalUrl,
  };
}
