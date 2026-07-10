import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { mdxComponents } from "@/src/components/mdx-components";
import { PostEngagement } from "@/src/components/post-engagement";
import { getAllPostSlugs, getPostBySlug } from "@/src/content/posts";

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
        {post.visibility !== "public" ? (
          <aside className="access-note">
            Access checks will attach here when auth and subscriptions are
            implemented.
          </aside>
        ) : null}
        <div className="article-content">
          <MDXRemote source={post.body} components={mdxComponents} />
        </div>
        <PostEngagement post={post} />
      </article>
    </main>
  );
}
