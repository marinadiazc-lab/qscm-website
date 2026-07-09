import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  createPostMetadataIndexEntry,
  getPostVisibilityLabel,
  postFrontmatterSchema,
  type ContentTierId,
  type PostAccessRequirement,
  type PostMetadataIndex,
  type PostMetadataIndexEntry,
  type PostVisibility,
  type PublicationId,
} from "@/src/domains/content";

const postsDirectory = path.join(process.cwd(), "content", "posts");

export type { PostVisibility };

export type PostSummary = {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  status: "draft" | "published";
  visibility: PostVisibility;
  accessRequirement: PostAccessRequirement;
  publicationId?: PublicationId;
  tierIds: ContentTierId[];
  tags: string[];
  visibilityLabel: string;
  publishedAt: Date;
  publishedAtLabel: string;
  updatedAt?: Date;
  canonicalUrl?: string;
};

export type Post = PostSummary & {
  body: string;
  sourcePath: string;
  metadata: PostMetadataIndexEntry;
};

function getPostFiles() {
  if (!fs.existsSync(postsDirectory)) {
    return [];
  }

  return fs
    .readdirSync(postsDirectory)
    .filter((fileName) => fileName.endsWith(".md") || fileName.endsWith(".mdx"));
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

function readPost(fileName: string): Post {
  const fullPath = path.join(postsDirectory, fileName);
  const file = fs.readFileSync(fullPath, "utf8");
  const parsed = matter(file);
  const frontmatter = postFrontmatterSchema.parse(parsed.data);
  const metadata = createPostMetadataIndexEntry(frontmatter, fullPath);

  return {
    slug: frontmatter.slug,
    title: frontmatter.title,
    excerpt: frontmatter.excerpt,
    author: frontmatter.author,
    status: frontmatter.status,
    visibility: frontmatter.visibility,
    accessRequirement: metadata.accessRequirement,
    publicationId: frontmatter.publicationId,
    tierIds: metadata.tierIds,
    tags: metadata.tags,
    visibilityLabel: getPostVisibilityLabel(frontmatter.visibility),
    publishedAt: frontmatter.publishedAt,
    publishedAtLabel: formatDate(frontmatter.publishedAt),
    updatedAt: frontmatter.updatedAt,
    canonicalUrl: frontmatter.canonicalUrl,
    body: parsed.content,
    sourcePath: fullPath,
    metadata,
  };
}

export function getAllPosts({ includeDrafts = false } = {}) {
  return getPostFiles()
    .map(readPost)
    .filter((post) => includeDrafts || post.status === "published")
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

export function getAllPostSlugs() {
  return getAllPosts().map((post) => post.slug);
}

export function getPostBySlug(slug: string) {
  return getAllPosts({ includeDrafts: false }).find((post) => post.slug === slug);
}

export function getPostMetadataIndex({ includeDrafts = false } = {}): PostMetadataIndex {
  return getAllPosts({ includeDrafts }).reduce<PostMetadataIndex>((index, post) => {
    index[post.slug] = post.metadata;
    return index;
  }, {});
}
