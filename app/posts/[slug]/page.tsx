import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
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
    title: post.title,
    description: post.excerpt,
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <main className="page article">
      <article>
        <header className="article-header">
          <p className="badge">{post.visibilityLabel}</p>
          <h1 className="page-title">{post.title}</h1>
          <p className="lede">{post.excerpt}</p>
          <p className="post-meta">
            <span>{post.author}</span>
            <span>{post.publishedAtLabel}</span>
          </p>
        </header>
        {post.visibility !== "public" ? (
          <aside className="access-note">
            Access checks will attach here when auth and subscriptions are
            implemented.
          </aside>
        ) : null}
        <div className="article-content">
          <MDXRemote source={post.body} />
        </div>
        <PostEngagement post={post} />
      </article>
    </main>
  );
}
