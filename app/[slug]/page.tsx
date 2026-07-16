import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { mdxComponents } from "@/src/components/mdx-components";
import {
  getAllStaticPageSlugs,
  getStaticPageBySlug,
} from "@/src/content/pages";

type StaticPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return getAllStaticPageSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: StaticPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getStaticPageBySlug(slug);

  if (!page) {
    return {};
  }

  return {
    title: page.seo.title ?? page.title,
    description: page.seo.description ?? page.excerpt,
    alternates: page.seo.canonicalUrl
      ? {
          canonical: page.seo.canonicalUrl,
        }
      : undefined,
  };
}

export default async function StaticPageRoute({ params }: StaticPageProps) {
  const { slug } = await params;
  const page = getStaticPageBySlug(slug);

  if (!page) {
    notFound();
  }

  if (slug === "about") {
    return (
      <main className="about-page">
        <MDXRemote source={page.body} components={mdxComponents} />
      </main>
    );
  }

  return (
    <main className="page article">
      <article>
        <header className="article-header">
          <p className="badge">Page</p>
          <h1 className="page-title">{page.title}</h1>
          <p className="lede">{page.excerpt}</p>
        </header>
        <div className="article-content">
          <MDXRemote source={page.body} components={mdxComponents} />
        </div>
      </article>
    </main>
  );
}
