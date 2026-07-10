import type { MetadataRoute } from "next";
import { getAllStaticPages } from "@/src/content/pages";
import { getPublicPosts } from "@/src/content/posts";
import { absoluteUrl } from "@/src/content/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/posts"),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/subscribe"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const pages = getAllStaticPages().map((page) => ({
    url: absoluteUrl(`/${page.slug}`),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const posts = getPublicPosts().map((post) => ({
    url: absoluteUrl(`/posts/${post.slug}`),
    lastModified: post.updatedAt ?? post.publishedAt,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...pages, ...posts];
}
