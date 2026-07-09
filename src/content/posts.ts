import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";

const postsDirectory = path.join(process.cwd(), "content", "posts");

const postFrontmatterSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  excerpt: z.string().min(1),
  publishedAt: z.coerce.date(),
  author: z.string().min(1).default("QSCM"),
  status: z.enum(["draft", "published"]).default("published"),
  visibility: z
    .enum(["public", "free_subscribers", "paid_any", "specific_tiers"])
    .default("public"),
});

export type PostVisibility = z.infer<typeof postFrontmatterSchema>["visibility"];

export type PostSummary = {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  status: "draft" | "published";
  visibility: PostVisibility;
  visibilityLabel: string;
  publishedAt: Date;
  publishedAtLabel: string;
};

export type Post = PostSummary & {
  body: string;
  sourcePath: string;
};

function getPostFiles() {
  if (!fs.existsSync(postsDirectory)) {
    return [];
  }

  return fs
    .readdirSync(postsDirectory)
    .filter((fileName) => fileName.endsWith(".md") || fileName.endsWith(".mdx"));
}

function visibilityLabel(visibility: PostVisibility) {
  const labels: Record<PostVisibility, string> = {
    public: "Public",
    free_subscribers: "Free subscribers",
    paid_any: "Paid",
    specific_tiers: "Tier restricted",
  };

  return labels[visibility];
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

  return {
    slug: frontmatter.slug,
    title: frontmatter.title,
    excerpt: frontmatter.excerpt,
    author: frontmatter.author,
    status: frontmatter.status,
    visibility: frontmatter.visibility,
    visibilityLabel: visibilityLabel(frontmatter.visibility),
    publishedAt: frontmatter.publishedAt,
    publishedAtLabel: formatDate(frontmatter.publishedAt),
    body: parsed.content,
    sourcePath: fullPath,
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
