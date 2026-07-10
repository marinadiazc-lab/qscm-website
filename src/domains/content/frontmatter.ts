import { z } from "zod";
import { POST_STATUSES, POST_VISIBILITIES } from "./types";

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only.");

const localOrRemoteReferenceSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value.startsWith("/") ||
      value.startsWith("#") ||
      value.startsWith("http://") ||
      value.startsWith("https://"),
    "Use an absolute local path like /media/file.png or an http(s) URL.",
  );

export const contentImageSchema = z.object({
  src: localOrRemoteReferenceSchema,
  alt: z.string().min(1),
  caption: z.string().min(1).optional(),
});

export const contentSeoSchema = z.object({
  title: z.string().min(1).max(70).optional(),
  description: z.string().min(1).max(180).optional(),
  canonicalUrl: z.string().url().optional(),
  image: localOrRemoteReferenceSchema.optional(),
});

export const contentMediaReferenceSchema = z
  .object({
    src: localOrRemoteReferenceSchema,
    kind: z.enum(["image", "audio", "video", "download", "embed"]),
    title: z.string().min(1).optional(),
    alt: z.string().min(1).optional(),
  })
  .superRefine((media, ctx) => {
    if (media.kind === "image" && !media.alt) {
      ctx.addIssue({
        code: "custom",
        path: ["alt"],
        message: "Image media references require alt text.",
      });
    }
  });

export const postFrontmatterSchema = z
  .object({
    title: z.string().min(1),
    slug: slugSchema,
    excerpt: z.string().min(1).max(240),
    publishedAt: z.coerce.date(),
    author: z.string().min(1).default("QSCM"),
    status: z.enum(POST_STATUSES).default("published"),
    visibility: z.enum(POST_VISIBILITIES).default("public"),
    publicationId: z.string().min(1).optional(),
    tierIds: z.array(z.string().min(1)).default(() => []),
    tags: z.array(z.string().min(1)).default(() => []),
    updatedAt: z.coerce.date().optional(),
    canonicalUrl: z.string().url().optional(),
    coverImage: contentImageSchema.optional(),
    seo: contentSeoSchema.default(() => ({})),
    media: z.array(contentMediaReferenceSchema).default(() => []),
  })
  .superRefine((frontmatter, ctx) => {
    if (frontmatter.visibility === "specific_tiers" && frontmatter.tierIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["tierIds"],
        message: "specific_tiers posts must list at least one tierId.",
      });
    }

    if (frontmatter.updatedAt && frontmatter.updatedAt < frontmatter.publishedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "updatedAt cannot be before publishedAt.",
      });
    }
  });

export type ParsedPostFrontmatter = z.infer<typeof postFrontmatterSchema>;

export function parsePostFrontmatter(data: unknown, sourcePath: string): ParsedPostFrontmatter {
  const result = postFrontmatterSchema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join(".") : "frontmatter";
      return `- ${field}: ${issue.message}`;
    })
    .join("\n");

  throw new Error(`Invalid frontmatter in ${sourcePath}\n${issues}`);
}

export function getPostPublicationState(
  status: ParsedPostFrontmatter["status"],
  publishedAt: Date,
  now = new Date(),
) {
  if (status === "draft") {
    return "draft";
  }

  if (publishedAt.getTime() > now.getTime()) {
    return "scheduled";
  }

  return "published";
}
