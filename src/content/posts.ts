import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import {
  createPostMetadataIndexEntry,
  getPostVisibilityLabel,
  parsePostFrontmatter,
  type ContentTierId,
  type ContentImage,
  type ContentMediaReference,
  type ContentSeo,
  type PostAccessRequirement,
  type PostMetadataIndex,
  type PostMetadataIndexEntry,
  type PostPublicationState,
  type PostVisibility,
  type PublicationId,
} from "@/src/domains/content";

const postsDirectory = path.join(process.cwd(), "content", "posts");
const publicDirectory = path.join(process.cwd(), "public");

export type { PostVisibility };

export type PostSummary = {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  status: "draft" | "published";
  publicationState: PostPublicationState;
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
  coverImage?: ContentImage;
  seo: ContentSeo;
  media: ContentMediaReference[];
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

function createPostInventoryKey() {
  return getPostFiles()
    .map((fileName) => {
      const fullPath = path.join(postsDirectory, fileName);
      const stat = fs.statSync(fullPath);
      return `${fileName}:${stat.mtimeMs}:${stat.size}`;
    })
    .join("|");
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

function isRemoteReference(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}

function validateLocalMediaReference(src: string, sourcePath: string) {
  if (isRemoteReference(src)) {
    return;
  }

  if (!src.startsWith("/")) {
    throw new Error(`Invalid media reference in ${sourcePath}: ${src} must start with / or http(s).`);
  }

  const localPath = path.join(publicDirectory, src);

  if (!localPath.startsWith(publicDirectory) || !fs.existsSync(localPath)) {
    throw new Error(`Missing media reference in ${sourcePath}: ${src} was not found in public/.`);
  }
}

function getMarkdownImageSources(body: string) {
  return Array.from(body.matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)).map(
    (match) => match[1],
  );
}

const mediaLikePathPattern =
  /\.(a?ac|avif|csv|docx?|gif|jpe?g|m4a|m4v|mov|mp3|mp4|oga|ogg|pdf|png|pptx?|svg|txt|wav|webm|webp|xlsx?|zip)$/i;

function isLikelyMediaAssetReference(src: string) {
  const pathWithoutQueryOrHash = src.split(/[?#]/)[0];
  return pathWithoutQueryOrHash.startsWith("/media/") || mediaLikePathPattern.test(pathWithoutQueryOrHash);
}

function getQuotedMdxAttributeSources(body: string, tagPattern: string, attribute: string) {
  const pattern = new RegExp(
    `<\\s*(?:${tagPattern})\\b[^>]*\\s${attribute}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|\\{\\s*["']([^"']+)["']\\s*\\})`,
    "gi",
  );

  return Array.from(body.matchAll(pattern)).map((match) => match[1] ?? match[2] ?? match[3]);
}

function getMdxMediaSources(body: string) {
  const requiredMediaReferences = [
    ...getQuotedMdxAttributeSources(body, "audio|video|source|track|img", "src"),
    ...getQuotedMdxAttributeSources(body, "video", "poster"),
  ];

  const optionalMediaReferences = [
    ...getQuotedMdxAttributeSources(body, "a", "href"),
    ...getQuotedMdxAttributeSources(body, "embed|iframe", "src"),
    ...getQuotedMdxAttributeSources(body, "object", "data"),
  ].filter(isLikelyMediaAssetReference);

  return [...requiredMediaReferences, ...optionalMediaReferences];
}

function validatePostMedia(post: Post, body: string) {
  const references = Array.from(new Set([
    post.coverImage?.src,
    post.seo.image,
    ...post.media.map((media) => media.src),
    ...getMarkdownImageSources(body),
    ...getMdxMediaSources(body),
  ].filter((src): src is string => Boolean(src))));

  for (const src of references) {
    validateLocalMediaReference(src, post.sourcePath);
  }
}

function readPost(fileName: string, now = new Date()): Post {
  const fullPath = path.join(postsDirectory, fileName);
  const file = fs.readFileSync(fullPath, "utf8");
  const parsed = matter(file);
  const frontmatter = parsePostFrontmatter(parsed.data, fullPath);
  const metadata = createPostMetadataIndexEntry(frontmatter, fullPath, now);

  const post = {
    slug: frontmatter.slug,
    title: frontmatter.title,
    excerpt: frontmatter.excerpt,
    author: frontmatter.author,
    status: frontmatter.status,
    publicationState: metadata.publicationState,
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
    coverImage: frontmatter.coverImage,
    seo: frontmatter.seo,
    media: metadata.media,
    body: parsed.content,
    sourcePath: fullPath,
    metadata,
  };

  validatePostMedia(post, parsed.content);

  return post;
}

type GetPostsOptions = {
  includeUnpublished?: boolean;
  includeNonPublic?: boolean;
  now?: Date;
};

let cachedInventoryKey: string | undefined;
let cachedPosts: Post[] | undefined;
let cachedPublicationMinute: number | undefined;

function readAllPosts(now = new Date()) {
  const inventoryKey = createPostInventoryKey();
  const publicationMinute = Math.floor(now.getTime() / 60_000);

  if (
    cachedPosts &&
    cachedInventoryKey === inventoryKey &&
    cachedPublicationMinute === publicationMinute
  ) {
    return cachedPosts;
  }

  cachedInventoryKey = inventoryKey;
  cachedPublicationMinute = publicationMinute;
  cachedPosts = getPostFiles().map((fileName) => readPost(fileName, now));
  return cachedPosts;
}

export function isPostPublished(post: PostSummary) {
  return post.publicationState === "published";
}

export function isPostPublic(post: PostSummary) {
  return isPostPublished(post) && post.visibility === "public";
}

export function getAllPosts({
  includeUnpublished = false,
  includeNonPublic = true,
  now = new Date(),
}: GetPostsOptions = {}) {
  return readAllPosts(now)
    .filter((post) => includeUnpublished || isPostPublished(post))
    .filter((post) => includeNonPublic || post.visibility === "public")
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

export function getAllPostSlugs() {
  return getAllPosts({ includeUnpublished: false }).map((post) => post.slug);
}

export function getPublicPosts() {
  return getAllPosts({ includeUnpublished: false, includeNonPublic: false });
}

export function getPostBySlug(slug: string, { includeUnpublished = false } = {}) {
  return getAllPosts({ includeUnpublished }).find((post) => post.slug === slug);
}

export function getPostMetadataIndex({
  includeUnpublished = false,
  includeNonPublic = true,
}: GetPostsOptions = {}): PostMetadataIndex {
  return getAllPosts({ includeUnpublished, includeNonPublic }).reduce<PostMetadataIndex>((index, post) => {
    index[post.slug] = post.metadata;
    return index;
  }, {});
}
