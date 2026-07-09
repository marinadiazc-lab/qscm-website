import { z } from "zod";
import { POST_STATUSES, POST_VISIBILITIES } from "./types";

export const postFrontmatterSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  excerpt: z.string().min(1),
  publishedAt: z.coerce.date(),
  author: z.string().min(1).default("QSCM"),
  status: z.enum(POST_STATUSES).default("published"),
  visibility: z.enum(POST_VISIBILITIES).default("public"),
  publicationId: z.string().min(1).optional(),
  tierIds: z.array(z.string().min(1)).default(() => []),
  tags: z.array(z.string().min(1)).default(() => []),
  updatedAt: z.coerce.date().optional(),
  canonicalUrl: z.string().url().optional(),
});

export type ParsedPostFrontmatter = z.infer<typeof postFrontmatterSchema>;
