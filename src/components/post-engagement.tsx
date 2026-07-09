import type { PostSummary } from "@/src/content/posts";

export function PostEngagement({ post }: { post: PostSummary }) {
  return (
    <section className="engagement-panel" aria-labelledby="engagement-title">
      <div className="engagement-header">
        <div>
          <p className="badge">Engagement</p>
          <h2 id="engagement-title">Join the conversation</h2>
        </div>
        <form>
          <button className="secondary-button" type="button">
            Like
          </button>
        </form>
      </div>

      <form className="inline-form">
        <label htmlFor="share-email">Send this post by email</label>
        <div className="form-row">
          <input
            id="share-email"
            name="email"
            placeholder="friend@example.com"
            type="email"
          />
          <button className="button" type="button">
            Send
          </button>
        </div>
      </form>

      <form className="comment-form">
        <h3>Leave a comment</h3>
        <div className="form-grid">
          <label>
            Name
            <input name="name" placeholder="Your name" type="text" />
          </label>
          <label>
            Email
            <input name="email" placeholder="you@example.com" type="email" />
          </label>
        </div>
        <label>
          Website
          <input name="website" placeholder="Optional" type="url" />
        </label>
        <label>
          Comment
          <textarea
            name="comment"
            placeholder={`Respond to "${post.title}"`}
            rows={5}
          />
        </label>
        <button className="button" type="button">
          Publish comment
        </button>
      </form>
    </section>
  );
}
