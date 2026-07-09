import Link from "next/link";
import { PostList } from "@/src/components/post-list";
import { getAllPosts } from "@/src/content/posts";

export default function HomePage() {
  const latestPosts = getAllPosts().slice(0, 3);

  return (
    <main className="page">
      <section className="hero">
        <p className="badge">Newsletter platform</p>
        <h1>Publish file-authored writing with paid access later.</h1>
        <p className="lede">
          This is the first working foundation: posts come from Markdown/MDX
          files, while accounts, payments, comments, email, and podcast access
          can attach around them.
        </p>
        <div className="toolbar">
          <Link className="button" href="/posts">
            Read posts
          </Link>
          <Link className="secondary-button" href="/subscribe">
            Subscribe
          </Link>
        </div>
      </section>

      <section className="section">
        <h2>Latest posts</h2>
        <PostList posts={latestPosts} />
      </section>

      <section className="section">
        <div className="wire-panel">
          <h2>Next build targets</h2>
          <p>Magic-link auth, Resend integration, Stripe tiers, and comments.</p>
        </div>
      </section>
    </main>
  );
}
