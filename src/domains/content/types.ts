export type PublicationId = string;
export type PublicationSlug = string;

export type PublicationStatus = "draft" | "active" | "archived";

export interface Publication {
  id: PublicationId;
  slug: PublicationSlug;
  name: string;
  description?: string;
  status: PublicationStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PostSlug = string;
export type ContentTierId = string;

export const POST_STATUSES = ["draft", "published"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export type PostPublicationState = "draft" | "scheduled" | "published";

export const POST_VISIBILITIES = [
  "public",
  "free_subscribers",
  "paid_any",
  "specific_tiers",
] as const;
export type PostVisibility = (typeof POST_VISIBILITIES)[number];

export interface PostFrontmatter {
  title: string;
  slug: PostSlug;
  excerpt: string;
  publishedAt: Date;
  author: string;
  status: PostStatus;
  visibility: PostVisibility;
  publicationId?: PublicationId;
  tierIds: ContentTierId[];
  tags: string[];
  updatedAt?: Date;
  canonicalUrl?: string;
  coverImage?: ContentImage;
  seo?: ContentSeo;
  newsletter?: PostNewsletterOptions;
  media: ContentMediaReference[];
}

export interface PostNewsletterOptions {
  enabled: boolean;
  subject?: string;
  previewText?: string;
  audience?: "public" | "free_subscribers" | "paid_any" | "specific_tiers";
}

export type ContentMediaKind = "image" | "audio" | "video" | "download" | "embed";

export interface ContentImage {
  src: string;
  alt: string;
  caption?: string;
}

export interface ContentSeo {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  image?: string;
}

export interface ContentMediaReference {
  src: string;
  kind: ContentMediaKind;
  title?: string;
  alt?: string;
}

export type PostAccessRule =
  | "public"
  | "free_subscriber"
  | "paid_subscription"
  | "specific_tiers";

export interface PostAccessRequirement {
  visibility: PostVisibility;
  rule: PostAccessRule;
  requiresAuthentication: boolean;
  requiresPaidSubscription: boolean;
  allowedTierIds: ContentTierId[];
}

export interface PostMetadataIndexEntry {
  slug: PostSlug;
  sourcePath: string;
  title: string;
  excerpt: string;
  author: string;
  status: PostStatus;
  publicationState: PostPublicationState;
  visibility: PostVisibility;
  accessRequirement: PostAccessRequirement;
  publishedAt: Date;
  publicationId?: PublicationId;
  tierIds: ContentTierId[];
  tags: string[];
  updatedAt?: Date;
  canonicalUrl?: string;
  coverImage?: ContentImage;
  seo?: ContentSeo;
  newsletter?: PostNewsletterOptions;
  media: ContentMediaReference[];
}

export type PostMetadataIndex = Record<PostSlug, PostMetadataIndexEntry>;
