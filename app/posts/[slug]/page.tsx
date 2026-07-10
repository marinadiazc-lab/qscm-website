import type { Metadata } from "next";
import Link from "next/link";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { mdxComponents } from "@/src/components/mdx-components";
import { PostEngagement } from "@/src/components/post-engagement";
import { getAllPostSlugs, getPostBySlug } from "@/src/content/posts";
import {
  evaluatePostAccess,
  getAccessiblePostBody,
  getPostAccessViewerForRequest,
  type PostAccessDecision,
} from "@/src/domains/content";

type PostPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return getAllPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {};
  }

  return {
    title: post.seo.title ?? post.title,
    description: post.seo.description ?? post.excerpt,
    alternates: {
      canonical: post.seo.canonicalUrl ?? post.canonicalUrl,
    },
    openGraph: {
      title: post.seo.title ?? post.title,
      description: post.seo.description ?? post.excerpt,
      type: "article",
      publishedTime: post.publishedAt.toISOString(),
      modifiedTime: post.updatedAt?.toISOString(),
      images: post.seo.image ?? post.coverImage?.src,
    },
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  const preview = (await draftMode()).isEnabled;
  const post = getPostBySlug(slug, { includeUnpublished: preview });

  if (!post) {
    notFound();
  }

  const viewer = await getPostAccessViewerForRequest();
  const accessDecision =
    preview && post.publicationState !== "published"
      ? {
          allowed: true,
          reason: "public",
          requirement: post.accessRequirement,
          checkedAt: new Date(),
          lock: null,
        } satisfies PostAccessDecision
      : evaluatePostAccess({
          requirement: post.accessRequirement,
          viewer,
        });
  const accessibleBody = getAccessiblePostBody(post.body, accessDecision);

  return (
    <main className="page article">
      <article>
        <header className="article-header">
          <p className="badge">
            {preview && post.publicationState !== "published"
              ? `Preview: ${post.publicationState}`
              : post.visibilityLabel}
          </p>
          <h1 className="page-title">{post.title}</h1>
          <p className="lede">{post.excerpt}</p>
          <p className="post-meta">
            <span>{post.author}</span>
            <span>{post.publishedAtLabel}</span>
          </p>
          {post.coverImage ? (
            <figure className="cover-media">
              <img src={post.coverImage.src} alt={post.coverImage.alt} />
              {post.coverImage.caption ? (
                <figcaption>{post.coverImage.caption}</figcaption>
              ) : null}
            </figure>
          ) : null}
        </header>
        {preview && post.publicationState !== "published" ? (
          <aside className="access-note">
            Preview mode is active for this unpublished post. Full admin
            permission checks still need to be attached before this can be used
            as the final editorial preview system.
          </aside>
        ) : null}
        {accessibleBody !== null ? (
          <>
            <div className="article-content">
              <MDXRemote source={accessibleBody} components={mdxComponents} />
            </div>
            <PostEngagement post={post} />
          </>
        ) : (
          <LockedPostContent decision={accessDecision} />
        )}
      </article>
    </main>
  );
}

function LockedPostContent({ decision }: { decision: PostAccessDecision }) {
  if (!decision.lock) {
    return null;
  }

  const href = decision.lock.primaryAction === "login" ? "/login" : "/subscribe";
  const actionLabel =
    decision.lock.primaryAction === "login"
      ? "Sign in"
      : decision.lock.primaryAction === "upgrade"
        ? "View tiers"
        : "Subscribe";

  return (
    <aside className="locked-content" aria-label="Locked content">
      <p className="badge">{decision.requirement.visibility}</p>
      <h2>{decision.lock.title}</h2>
      <p>{decision.lock.message}</p>
      <Link className="button" href={href}>
        {actionLabel}
      </Link>
    </aside>
  );
}
