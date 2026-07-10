import type { PostSummary } from "@/src/content/posts";
import { buildNewsletterPostEmail } from "./templates";
import type { CreateEmailBroadcastInput, EmailBroadcastTarget, EmailMetadata } from "./types";

export type NewsletterBroadcastOptions = {
  siteName: string;
  siteUrl: string;
  defaultPublicationId: string;
  audienceIds?: Record<"public" | "free_subscribers" | "paid_any", string>;
  tierSegmentIds?: Record<string, string>;
};

export function createNewsletterBroadcastFromPost(
  post: PostSummary,
  options: NewsletterBroadcastOptions,
): CreateEmailBroadcastInput | undefined {
  if (!post.newsletter?.enabled || post.publicationState !== "published") {
    return undefined;
  }

  const publicationId = post.publicationId ?? options.defaultPublicationId;
  const postUrl = new URL(`/posts/${post.slug}`, options.siteUrl).toString();
  const audience = post.newsletter.audience ?? post.visibility;
  const content = buildNewsletterPostEmail({
    siteName: options.siteName,
    siteUrl: options.siteUrl,
    postTitle: post.title,
    postUrl,
    excerpt: post.excerpt,
    subject: post.newsletter.subject,
    previewText: post.newsletter.previewText,
    unsubscribeHint: true,
  });

  return {
    publicationId,
    key: `post:${post.slug}`,
    content,
    target: targetForPost(post, audience, options),
    metadata: compactMetadata({
      postSlug: post.slug,
      sourcePath: "sourcePath" in post ? String(post.sourcePath) : null,
      visibility: post.visibility,
      audience,
    }),
  };
}

function targetForPost(
  post: PostSummary,
  audience: "public" | "free_subscribers" | "paid_any" | "specific_tiers",
  options: NewsletterBroadcastOptions,
): EmailBroadcastTarget {
  if (audience === "specific_tiers") {
    return {
      segmentIds: post.tierIds
        .map((tierId) => options.tierSegmentIds?.[tierId])
        .filter((segmentId): segmentId is string => Boolean(segmentId)),
    };
  }

  const audienceId = options.audienceIds?.[audience];
  return audienceId ? { audienceIds: [audienceId] } : { segmentIds: [audience] };
}

function compactMetadata(metadata: EmailMetadata) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== null),
  ) as EmailMetadata;
}
