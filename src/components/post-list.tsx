import Link from "next/link";
import type { PostSummary } from "@/src/content/posts";

export function PostList({ posts }: { posts: PostSummary[] }) {
  if (posts.length === 0) {
    return <p>No posts published yet.</p>;
  }

  return (
    <ul className="post-list">
      {posts.map((post) => (
        <li className="post-card" key={post.slug}>
          <p className="badge">{post.visibilityLabel}</p>
          <h3>
            <Link href={`/posts/${post.slug}`}>{post.title}</Link>
          </h3>
          <p>{post.excerpt}</p>
          <p className="post-meta">
            <span>{post.author}</span>
            <span>{post.publishedAtLabel}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
