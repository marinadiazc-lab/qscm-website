import type { Metadata } from "next";
import { PostList } from "@/src/components/post-list";
import { getAllPosts } from "@/src/content/posts";

export const metadata: Metadata = {
  title: "Posts",
  description: "Latest QSCM posts.",
};

export default function PostsPage() {
  const posts = getAllPosts();

  return (
    <main className="page stack">
      <header className="hero">
        <p className="badge">Posts</p>
        <h1 className="page-title">Latest writing</h1>
        <p className="lede">
          These posts are compiled from files in <code>content/posts</code>.
        </p>
      </header>
      <PostList posts={posts} />
    </main>
  );
}
