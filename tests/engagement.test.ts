import { describe, expect, it } from "vitest";
import { getPostBySlug } from "../src/content/posts";
import { InMemoryEmailProvider } from "../src/domains/email";
import {
  createEngagementPostMetadata,
  EngagementService,
  InMemoryEngagementRepository,
  type EngagementActor,
} from "../src/domains/engagement";

const now = new Date("2026-07-10T12:00:00.000Z");
const actor: EngagementActor = {
  kind: "anonymous",
  anonymousActorHash: "actor_hash_1",
};

describe("engagement service", () => {
  it("persists likes once per actor and returns viewer state", async () => {
    const repository = new InMemoryEngagementRepository(["welcome"]);
    const service = new EngagementService(repository, { now: () => now });

    expect(await service.likePost({ postSlug: "welcome", actor })).toMatchObject({
      ok: true,
      likeCount: 1,
    });
    expect(await service.likePost({ postSlug: "welcome", actor })).toMatchObject({
      ok: true,
      likeCount: 1,
    });
    expect(await service.getSummary("welcome", actor)).toMatchObject({
      likeCount: 1,
      viewerHasLiked: true,
    });
  });

  it("publishes clean comments immediately without leaking private fields", async () => {
    const repository = new InMemoryEngagementRepository(["welcome"]);
    const service = new EngagementService(repository, { now: () => now });
    const result = await service.submitComment({
      postSlug: "welcome",
      body: "Thoughtful note",
      name: "Ada",
      email: "Ada@Example.com",
      actor,
      requestContext: { anonymousActorHash: actor.anonymousActorHash },
    });

    expect(result).toMatchObject({
      ok: true,
      status: "published",
      comment: {
        body: "Thoughtful note",
        commenter: { displayName: "Ada" },
        moderationStatus: "approved",
      },
    });
    expect(JSON.stringify(result)).not.toContain("Ada@Example.com");
    expect(await service.getSummary("welcome", actor)).toMatchObject({
      commentCount: 1,
    });
  });

  it("holds suspicious comments and keeps queue private context for moderators", async () => {
    const repository = new InMemoryEngagementRepository(["welcome"]);
    const service = new EngagementService(repository, { now: () => now });
    const result = await service.submitComment({
      postSlug: "welcome",
      body: "Please see my site",
      name: "Reader",
      email: "reader@example.com",
      website: "https://example.com",
      actor,
      requestContext: { anonymousActorHash: actor.anonymousActorHash },
    });

    expect(result).toMatchObject({
      ok: true,
      status: "held",
    });
    expect(await service.getSummary("welcome", actor)).toMatchObject({
      commentCount: 0,
    });
    expect(await repository.listModerationQueue()).toMatchObject([
      {
        moderationStatus: "suspicious",
        privateFields: {
          email: "reader@example.com",
          website: "https://example.com",
        },
      },
    ]);
  });

  it("blocks honeypot comments and rate limits repeated comments", async () => {
    const repository = new InMemoryEngagementRepository(["welcome"]);
    const service = new EngagementService(repository, {
      now: () => now,
      commentRateLimit: { windowSeconds: 600, maxAttempts: 1 },
    });

    expect(
      await service.submitComment({
        postSlug: "welcome",
        body: "Looks good",
        name: "Bot",
        email: "bot@example.com",
        honeypot: "filled",
        actor,
        requestContext: { anonymousActorHash: actor.anonymousActorHash },
      }),
    ).toMatchObject({
      ok: true,
      status: "blocked",
    });
    expect(
      await service.submitComment({
        postSlug: "welcome",
        body: "Second try",
        name: "Bot",
        email: "bot@example.com",
        actor,
        requestContext: { anonymousActorHash: actor.anonymousActorHash },
      }),
    ).toMatchObject({
      ok: false,
      status: "rate_limited",
    });
  });

  it("returns field errors for invalid comment submissions", async () => {
    const repository = new InMemoryEngagementRepository(["welcome"]);
    const service = new EngagementService(repository, { now: () => now });

    expect(
      await service.submitComment({
        postSlug: "welcome",
        body: "",
        name: "",
        email: "not-an-email",
        actor,
      }),
    ).toMatchObject({
      ok: false,
      status: "invalid",
      fieldErrors: {
        body: "Comment body is required.",
        name: "Name is required.",
        email: "A valid email is required.",
      },
    });
  });

  it("records email shares without a provider and queues through the email interface when supplied", async () => {
    const repository = new InMemoryEngagementRepository(["welcome"]);
    const emailProvider = new InMemoryEmailProvider({ now: () => now });
    const service = new EngagementService(repository, { now: () => now });

    expect(
      await service.sharePostByEmail({
        postSlug: "welcome",
        recipientEmail: "friend@example.com",
        postTitle: "Welcome",
        postUrl: "https://example.com/posts/welcome",
        actor,
      }),
    ).toMatchObject({
      ok: true,
      status: "recorded",
    });
    expect(
      await service.sharePostByEmail({
        postSlug: "welcome",
        recipientEmail: "friend2@example.com",
        senderName: "Ada",
        postTitle: "Welcome",
        postUrl: "https://example.com/posts/welcome",
        actor: { kind: "anonymous", anonymousActorHash: "actor_hash_2" },
        emailProvider,
        publicationId: "pub_1",
      }),
    ).toMatchObject({
      ok: true,
      status: "queued",
    });
    expect(emailProvider.listSentResults()).toHaveLength(1);
    expect(emailProvider.listSentResults()[0].dedupeKey).not.toContain("friend2@example.com");
    expect(emailProvider.listSentResults()[0].dedupeKey).toMatch(
      /share:welcome:actor_hash_2:[a-f0-9]{64}/,
    );
  });

  it("maps a valid MDX post into database post metadata for engagement persistence", () => {
    const post = getPostBySlug("welcome");

    expect(post).toBeDefined();
    if (!post) return;

    expect(createEngagementPostMetadata(post)).toMatchObject({
      slug: "welcome",
      title: "Welcome to the QSCM foundation",
      sourcePath: expect.stringContaining("content/posts/welcome.mdx"),
      sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      status: "published",
      visibility: "public",
      tags: ["updates"],
    });
  });
});
