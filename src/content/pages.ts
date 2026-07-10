import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { validateStaticMdxMedia } from "@/src/domains/media/static-content";

const pagesDirectory = path.join(process.cwd(), "content", "pages");

const pageFrontmatterSchema = z.object({
  title: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only."),
  excerpt: z.string().min(1).max(240),
  seo: z
    .object({
      title: z.string().min(1).max(70).optional(),
      description: z.string().min(1).max(180).optional(),
      canonicalUrl: z.string().url().optional(),
    })
    .default(() => ({})),
});

export type StaticPage = {
  slug: string;
  title: string;
  excerpt: string;
  seo: {
    title?: string;
    description?: string;
    canonicalUrl?: string;
  };
  body: string;
  sourcePath: string;
};

function getPageFiles() {
  if (!fs.existsSync(pagesDirectory)) {
    return [];
  }

  return fs
    .readdirSync(pagesDirectory)
    .filter((fileName) => fileName.endsWith(".md") || fileName.endsWith(".mdx"));
}

function parsePageFrontmatter(data: unknown, sourcePath: string) {
  const result = pageFrontmatterSchema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join(".") : "frontmatter";
      return `- ${field}: ${issue.message}`;
    })
    .join("\n");

  throw new Error(`Invalid page frontmatter in ${sourcePath}\n${issues}`);
}

function readPage(fileName: string): StaticPage {
  const fullPath = path.join(pagesDirectory, fileName);
  const file = fs.readFileSync(fullPath, "utf8");
  const parsed = matter(file);
  const frontmatter = parsePageFrontmatter(parsed.data, fullPath);
  validateStaticMdxMedia([], parsed.content, fullPath);

  return {
    slug: frontmatter.slug,
    title: frontmatter.title,
    excerpt: frontmatter.excerpt,
    seo: frontmatter.seo,
    body: parsed.content,
    sourcePath: fullPath,
  };
}

export function getAllStaticPages() {
  return getPageFiles()
    .map(readPage)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function getAllStaticPageSlugs() {
  return getAllStaticPages().map((page) => page.slug);
}

export function getStaticPageBySlug(slug: string) {
  return getAllStaticPages().find((page) => page.slug === slug);
}
