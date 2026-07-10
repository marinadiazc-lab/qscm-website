import { describe, expect, it } from "vitest";
import { InMemoryEmailProvider, type EmailSendIntentReference } from "../src/domains/email";
import {
  buildComment,
  CommentService,
  InMemoryCommentRepository,
  toPublicImmediateComment,
  type CommentRecord,
} from "../src/domains/comments";

const now = new Date("2026-07-10T12:00:00.000Z");

describe("comments", () => {
  it("normalizes private commenter fields and keeps public output privacy-safe", () => {
    const result = buildComment(
      {
        postSlug: " welcome ",
        body: " Hello QSCM ",
        commenter: {
          kind: "anonymous",
          name: " Ada ",
          email: " ADA@Example.COM ",
          website: " https://example.com ",
        },
        requestContext: { ipHash: "redacted" },
      },
      { id: "comment_1", now },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.comment).toMatchObject({
      postSlug: "welcome",
      body: "Hello QSCM",
      commenter: { kind: "anonymous", displayName: "Ada" },
      privateFields: {
        email: "ada@example.com",
        website: "https://example.com",
      },
      moderationStatus: "approved",
    });
    expect(result.publicComment).toEqual({
      id: "comment_1",
      postSlug: "welcome",
      body: "Hello QSCM",
      commenter: { kind: "anonymous", displayName: "Ada" },
      moderationStatus: "approved",
      publicationMode: "public_immediate",
      createdAt: now,
      publishedAt: now,
    });
    expect(JSON.stringify(result.publicComment)).not.toContain("ada@example.com");
  });

  it("validates required comment fields and withholds suspicious comments from public lists", () => {
    const invalid = buildComment(
      {
        postSlug: "",
        body: "",
        commenter: { kind: "anonymous", name: "", email: "" },
      },
      { id: "comment_invalid", now },
    );

    expect(invalid).toMatchObject({
      ok: false,
      errors: [
        { code: "missing_post" },
        { code: "missing_body" },
        { code: "missing_name" },
        { code: "missing_email" },
      ],
    });

    const repository = new InMemoryCommentRepository();
    const service = new CommentService(repository, {
      idFactory: () => "comment_suspicious",
      clock: () => now,
      checks: [
        {
          name: "flag-links",
          decide: () => ({ source: "system", outcome: "suspicious", reason: "link_review" }),
        },
      ],
    });

    const created = service.create({
      postSlug: "welcome",
      body: "Please review this",
      commenter: { kind: "registered_user", userId: "user_1", displayName: "Reader" },
    });

    expect(created.ok).toBe(true);
    expect(service.listSuspiciousQueue()).toHaveLength(1);
    expect(service.listPublicByPost("welcome")).toEqual([]);
  });

  it("withholds blocked comments from immediate public output", () => {
    const result = buildComment(
      {
        postSlug: "welcome",
        body: "Blocked body",
        commenter: { kind: "anonymous", name: "Spammer", email: "spam@example.com" },
      },
      {
        id: "comment_blocked",
        now,
        checks: [
          {
            name: "block-spam",
            decide: () => ({ source: "spam", outcome: "block", reason: "spam_pattern" }),
          },
        ],
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.comment.moderationStatus).toBe("blocked");
    expect(result.publicComment).toBeUndefined();
  });

  it("returns defensive comment copies from the repository", () => {
    const comment: CommentRecord = {
      id: "comment_1",
      postSlug: "welcome",
      body: "Hello",
      commenter: { kind: "anonymous", displayName: "Ada" },
      privateFields: { email: "ada@example.com" },
      moderationStatus: "approved",
      moderationAudit: [],
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    };
    const repository = new InMemoryCommentRepository([comment]);
    const stored = repository.findById("comment_1")!;

    stored.privateFields.email = "changed@example.com";

    expect(repository.findById("comment_1")?.privateFields.email).toBe("ada@example.com");
    expect(toPublicImmediateComment(repository.findById("comment_1")!)).toMatchObject({
      id: "comment_1",
      publicationMode: "public_immediate",
    });
  });
});

describe("in-memory email provider", () => {
  const intent = (id: string, dedupeKey: string): EmailSendIntentReference => ({
    id,
    dedupeKey,
  });

  it("upserts contacts case-insensitively within a publication", async () => {
    const provider = new InMemoryEmailProvider({ now: () => now });
    const first = await provider.upsertContact({
      publicationId: "pub_1",
      email: "Reader@Example.com",
      name: "Reader",
      audienceIds: ["audience_1"],
    });
    const second = await provider.upsertContact({
      publicationId: "pub_1",
      email: " reader@example.COM ",
      segmentIds: ["segment_1"],
      fields: { plan: "paid" },
    });

    expect(second.id).toBe(first.id);
    expect(provider.listContacts()).toHaveLength(1);
    expect(provider.listContacts()[0]).toMatchObject({
      audienceIds: ["audience_1"],
      segmentIds: ["segment_1"],
      fields: { plan: "paid" },
    });
  });

  it("dedupes transactional and broadcast sends by dedupe key", async () => {
    const provider = new InMemoryEmailProvider({ now: () => now });
    const first = await provider.sendTransactional({
      publicationId: "pub_1",
      purpose: "comment_notification",
      intent: intent("intent_1", "dedupe_1"),
      to: { email: "reader@example.com" },
      content: { subject: "New comment", text: "A comment was posted." },
    });
    const duplicate = await provider.sendTransactional({
      publicationId: "pub_1",
      purpose: "comment_notification",
      intent: intent("intent_2", "dedupe_1"),
      to: { email: "reader@example.com" },
      content: { subject: "New comment", text: "A comment was posted." },
    });

    expect(first).toMatchObject({ accepted: true, status: "sent" });
    expect(duplicate).toMatchObject({
      accepted: false,
      status: "skipped_duplicate",
      dedupeKey: "dedupe_1",
    });
    expect(provider.listSentResults()).toHaveLength(2);
  });
});
