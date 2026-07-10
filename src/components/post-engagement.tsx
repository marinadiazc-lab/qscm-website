"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import type { PostSummary } from "@/src/content/posts";

type PublicComment = {
  id: string;
  body: string;
  commenter: {
    displayName: string;
  };
  publishedAt?: string;
  createdAt: string;
};

type EngagementSummary = {
  likeCount: number;
  viewerHasLiked: boolean;
  comments: PublicComment[];
  commentCount: number;
};

type EngagementResponse = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  status?: string;
};

const emptySummary: EngagementSummary = {
  likeCount: 0,
  viewerHasLiked: false,
  comments: [],
  commentCount: 0,
};

export function PostEngagement({ post }: { post: PostSummary }) {
  const [summary, setSummary] = useState<EngagementSummary>(emptySummary);
  const [statusMessage, setStatusMessage] = useState("Loading engagement...");
  const [commentMessage, setCommentMessage] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;

    fetch(`/api/posts/${post.slug}/engagement`)
      .then((response) => response.json())
      .then((data: EngagementSummary) => {
        if (!active) return;
        setSummary(data);
        setStatusMessage("");
      })
      .catch(() => {
        if (!active) return;
        setStatusMessage("Engagement is temporarily unavailable.");
      });

    return () => {
      active = false;
    };
  }, [post.slug]);

  function refreshSummary() {
    fetch(`/api/posts/${post.slug}/engagement`)
      .then((response) => response.json())
      .then((data: EngagementSummary) => setSummary(data))
      .catch(() => undefined);
  }

  function likePost() {
    startTransition(async () => {
      const response = await fetch(`/api/posts/${post.slug}/engagement/like`, {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        setStatusMessage(result.message ?? "The like could not be saved.");
        return;
      }

      setSummary((current) => ({
        ...current,
        likeCount: result.likeCount,
        viewerHasLiked: true,
      }));
      setStatusMessage("Saved.");
    });
  }

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const response = await fetch(`/api/posts/${post.slug}/engagement/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      const result = await response.json();

      setCommentMessage(formatResponseMessage(result, "Comment received."));

      if (response.ok && result.ok) {
        form.reset();
        if (result.status === "published") {
          refreshSummary();
        }
      }
    });
  }

  function shareByEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const response = await fetch(`/api/posts/${post.slug}/engagement/share-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData)),
      });
      const result = await response.json();

      setShareMessage(formatResponseMessage(result, "Share recorded."));

      if (response.ok && result.ok) {
        form.reset();
      }
    });
  }

  return (
    <section className="engagement-panel" aria-labelledby="engagement-title">
      <div className="engagement-header">
        <div>
          <p className="badge">Engagement</p>
          <h2 id="engagement-title">Join the conversation</h2>
          {statusMessage ? <p className="form-status">{statusMessage}</p> : null}
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={likePost}
          disabled={isPending || summary.viewerHasLiked}
        >
          {summary.viewerHasLiked ? "Liked" : "Like"} · {summary.likeCount}
        </button>
      </div>

      <form className="inline-form" onSubmit={shareByEmail}>
        <label htmlFor="share-email">Send this post by email</label>
        <div className="form-row">
          <input
            id="share-email"
            name="email"
            placeholder="friend@example.com"
            type="email"
            required
          />
          <input className="hidden-field" name="company" tabIndex={-1} autoComplete="off" />
          <button className="button" type="submit" disabled={isPending}>
            Send
          </button>
        </div>
        {shareMessage ? <p className="form-status">{shareMessage}</p> : null}
      </form>

      <div className="comment-list" aria-live="polite">
        <h3>{summary.commentCount === 1 ? "1 comment" : `${summary.commentCount} comments`}</h3>
        {summary.comments.length > 0 ? (
          <ol>
            {summary.comments.map((comment) => (
              <li key={comment.id}>
                <p>{comment.body}</p>
                <span>
                  {comment.commenter.displayName} ·{" "}
                  {formatDate(comment.publishedAt ?? comment.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No comments yet.</p>
        )}
      </div>

      <form className="comment-form" onSubmit={submitComment}>
        <h3>Leave a comment</h3>
        <div className="form-grid">
          <label>
            Name
            <input name="name" placeholder="Your name" type="text" required />
          </label>
          <label>
            Email
            <input name="email" placeholder="you@example.com" type="email" required />
          </label>
        </div>
        <label>
          Website
          <input name="website" placeholder="Optional" type="url" />
        </label>
        <input className="hidden-field" name="company" tabIndex={-1} autoComplete="off" />
        <label>
          Comment
          <textarea
            name="comment"
            placeholder={`Respond to "${post.title}"`}
            rows={5}
            required
          />
        </label>
        <button className="button" type="submit" disabled={isPending}>
          Publish comment
        </button>
        {commentMessage ? <p className="form-status">{commentMessage}</p> : null}
      </form>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function formatResponseMessage(result: EngagementResponse, fallback: string) {
  const fieldErrors = Object.values(result.fieldErrors ?? {});

  if (fieldErrors.length > 0) {
    return [result.message, ...fieldErrors].filter(Boolean).join(" ");
  }

  return result.message ?? fallback;
}
