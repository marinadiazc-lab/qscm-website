import { createHash } from "node:crypto";
import fs from "node:fs";
import type { Post } from "@/src/content/posts";
import type { EngagementPostMetadata } from "./types";

export function createEngagementPostMetadata(post: Post): EngagementPostMetadata {
  return {
    slug: post.slug,
    sourcePath: post.sourcePath,
    sourceHash: hashFile(post.sourcePath),
    title: post.title,
    excerpt: post.excerpt,
    author: post.author,
    status: post.status,
    visibility: post.visibility,
    canonicalUrl: post.canonicalUrl,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    tags: post.tags,
  };
}

function hashFile(sourcePath: string) {
  return createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");
}
