import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { getPostBySlug } from "../src/content/posts";
import { InMemoryEmailProvider } from "../src/domains/email";
import {
  createEngagementPostMetadata,
  EngagementService,
  InMemoryEngagementRepository,
  type EngagementActor,
  type EngagementRequestContext,
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
    const service = new EngagementService(repository, {
      now: () => now,
      identifierHashSalt: "test-engagement-salt",
    });
    const rawContext = {
      anonymousActorHash: actor.anonymousActorHash,
      ipHash: "ip_hash",
      rawIp: "203.0.113.7",
      rawEmail: "reader@example.com",
    } as unknown as EngagementRequestContext;
    const result = await service.submitComment({
      postSlug: "welcome",
      body: "Please see my site",
      name: "Reader",
      email: "reader@example.com",
      website: "https://example.com",
      actor,
      requestContext: rawContext,
    });
    const queue = await repository.listModerationQueue();

    expect(result).toMatchObject({
      ok: true,
      status: "held",
    });
    expect(await service.getSummary("welcome", actor)).toMatchObject({
      commentCount: 0,
    });
    expect(queue).toMatchObject([
      {
        moderationStatus: "suspicious",
        privateFields: {
          email: "reader@example.com",
          website: "https://example.com",
        },
      },
    ]);
    expect(queue[0]?.requestContext).toEqual({
      anonymousActorHash: actor.anonymousActorHash,
      ipHash: "ip_hash",
      emailHash: createHmac("sha256", "test-engagement-salt")
        .update("reader@example.com")
        .digest("hex"),
    });
    expect(JSON.stringify(queue[0]?.requestContext)).not.toContain("203.0.113.7");
    expect(JSON.stringify(queue[0]?.requestContext)).not.toContain("rawEmail");
  });

  it("blocks honeypot comments and rate limits repeated comments", async () => {
    const repository = new InMemoryEngagementRepository(["welcome"]);
    const service = new EngagementService(repository, {
      now: () => now,
      commentRateLimit: { windowSeconds: 600, maxAttempts: 1 },
      scopedRateLimitStore: null,
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

  it("holds comments submitted faster than the launch timing window", async () => {
    const repository = new InMemoryEngagementRepository(["welcome"]);
    const service = new EngagementService(repository, { now: () => now });
    const result = await service.submitComment({
      postSlug: "welcome",
      body: "Too quick",
      name: "Speedy",
      email: "speedy@example.com",
      actor,
      requestContext: {
        anonymousActorHash: actor.anonymousActorHash,
        formAgeMs: 250,
      },
    });

    expect(result).toMatchObject({
      ok: true,
      status: "held",
    });
    expect(await repository.listModerationQueue()).toMatchObject([
      {
        moderationStatus: "suspicious",
        moderationAudit: [
          {
            decision: {
              source: "system",
              outcome: "suspicious",
              metadata: {
                signal: "fast_submit",
              },
            },
          },
        ],
      },
    ]);
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

  it("rate limits comments by scoped email hash even when the actor cookie changes", async () => {
    const repository = new InMemoryEngagementRepository(["welcome", "scheduled-briefing"]);
    const service = new EngagementService(repository, {
      now: () => now,
      commentRateLimit: { windowSeconds: 600, maxAttempts: 1 },
    });

    expect(
      await service.submitComment({
        postSlug: "welcome",
        body: "First",
        name: "Ada",
        email: "ada@example.com",
        actor: { kind: "anonymous", anonymousActorHash: "actor_hash_email_1" },
        requestContext: { anonymousActorHash: "actor_hash_email_1" },
      }),
    ).toMatchObject({
      ok: true,
      status: "published",
    });
    expect(
      await service.submitComment({
        postSlug: "scheduled-briefing",
        body: "Second",
        name: "Ada",
        email: "ada@example.com",
        actor: { kind: "anonymous", anonymousActorHash: "actor_hash_email_2" },
        requestContext: { anonymousActorHash: "actor_hash_email_2" },
      }),
    ).toMatchObject({
      ok: false,
      status: "rate_limited",
    });
  });

  it("rate limits authenticated users by user id when anonymous actor hashes differ", async () => {
    const repository = new InMemoryEngagementRepository(["welcome", "scheduled-briefing"]);
    const service = new EngagementService(repository, {
      now: () => now,
      likeRateLimit: { windowSeconds: 60, maxAttempts: 1 },
      scopedRateLimitStore: null,
    });

    expect(
      await service.likePost({
        postSlug: "welcome",
        actor: {
          kind: "registered_user",
          userId: "user_1",
          anonymousActorHash: "actor_hash_user_1",
        },
        requestContext: { anonymousActorHash: "actor_hash_user_1" },
      }),
    ).toMatchObject({
      ok: true,
      likeCount: 1,
    });
    expect(
      await service.likePost({
        postSlug: "scheduled-briefing",
        actor: {
          kind: "registered_user",
          userId: "user_1",
          anonymousActorHash: "actor_hash_user_2",
        },
        requestContext: { anonymousActorHash: "actor_hash_user_2" },
      }),
    ).toMatchObject({
      ok: false,
      status: "rate_limited",
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

  it("records but does not queue email shares submitted too quickly", async () => {
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
        requestContext: {
          anonymousActorHash: actor.anonymousActorHash,
          formAgeMs: 250,
        },
        emailProvider,
        publicationId: "pub_1",
      }),
    ).toMatchObject({
      ok: true,
      status: "recorded",
    });
    expect(emailProvider.listSentResults()).toHaveLength(0);
  });

  it("requires a private identifier hash salt in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENGAGEMENT_HASH_SALT", "");

    try {
      expect(
        () => new EngagementService(new InMemoryEngagementRepository(["welcome"])),
      ).toThrow(/ENGAGEMENT_HASH_SALT/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("maps a valid Markdown post into database post metadata for engagement persistence", () => {
    const post = getPostBySlug("welcome");

    expect(post).toBeDefined();
    if (!post) return;

    expect(createEngagementPostMetadata(post)).toMatchObject({
      slug: "welcome",
      title: "Welcome to the QSCM foundation",
      sourcePath: expect.stringContaining("content/posts/welcome.md"),
      sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      status: "published",
      visibility: "public",
      tags: ["updates"],
    });
  });
});
