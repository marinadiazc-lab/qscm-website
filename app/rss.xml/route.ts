import { getPublicPosts } from "@/src/content/posts";
import { absoluteUrl, getSiteUrl, siteName } from "@/src/content/site";

export const dynamic = "force-static";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function GET() {
  const posts = getPublicPosts();
  const lastBuildDate = posts[0]?.publishedAt ?? new Date();

  const items = posts
    .map((post) => {
      const url = absoluteUrl(`/posts/${post.slug}`);

      return `
        <item>
          <title>${escapeXml(post.title)}</title>
          <link>${escapeXml(url)}</link>
          <guid>${escapeXml(url)}</guid>
          <description>${escapeXml(post.excerpt)}</description>
          <pubDate>${post.publishedAt.toUTCString()}</pubDate>
        </item>`;
    })
    .join("");

  const rss = `<?xml version="1.0" encoding="UTF-8" ?>
    <rss version="2.0">
      <channel>
        <title>${escapeXml(siteName)}</title>
        <link>${escapeXml(getSiteUrl())}</link>
        <description>Public QSCM posts.</description>
        <lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>
        ${items}
      </channel>
    </rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
