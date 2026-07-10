import { describe, expect, it } from "vitest";
import {
  buildSubscriberCsv,
  InMemorySubscriberRepository,
  isMarketingSuppressed,
  isSyncRetryable,
  parseSubscriberCsv,
  SubscriberService,
  type SubscriberRecord,
} from "../src/domains/subscribers";

const now = new Date("2026-07-10T12:00:00.000Z");

function service(repository = new InMemorySubscriberRepository()) {
  return new SubscriberService(repository, {
    idFactory: () => "sub_1",
    clock: () => now,
  });
}

function subscriber(overrides: Partial<SubscriberRecord> = {}): SubscriberRecord {
  return {
    id: "sub_1",
    publicationId: "pub_1",
    email: "reader@example.com",
    status: "active",
    source: "free_signup",
    subscribedAt: now,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("subscriber signup", () => {
  it("persists a free subscriber, preferences, and pending Resend sync", async () => {
    const repository = new InMemorySubscriberRepository();
    const result = await service(repository).signup({
      publicationId: "pub_1",
      email: " Reader@Example.COM ",
      name: "Reader",
    });

    expect(result).toMatchObject({
      created: true,
      syncQueued: true,
      subscriber: {
        id: "sub_1",
        email: "reader@example.com",
        status: "active",
        metadata: { name: "Reader" },
      },
      preferences: {
        marketingEmailOptIn: true,
        productEmailOptIn: true,
      },
    });
    expect(repository.findProviderSync("sub_1", "resend")).toMatchObject({
      syncStatus: "pending",
      metadata: { pendingReason: "signup" },
    });
  });

  it("handles duplicate emails idempotently within a publication", async () => {
    const repository = new InMemorySubscriberRepository({
      subscribers: [subscriber({ email: "Reader@Example.com" })],
    });
    const result = await service(repository).signup({
      publicationId: "pub_1",
      email: "reader@example.com",
    });

    expect(result.created).toBe(false);
    expect(repository.listSubscribers({ publicationId: "pub_1" })).toHaveLength(1);
  });
});

describe("subscriber account linking and preferences", () => {
  it("links a subscriber to a verified matching user without creating duplicates", async () => {
    const repository = new InMemorySubscriberRepository({
      subscribers: [subscriber()],
    });
    const linked = await service(repository).linkToVerifiedUser({
      publicationId: "pub_1",
      email: "READER@example.com",
      userId: "user_1",
      emailVerified: true,
    });

    expect(linked).toMatchObject({ id: "sub_1", userId: "user_1" });
    expect(repository.listSubscribers({ publicationId: "pub_1" })).toHaveLength(1);
    expect(repository.findProviderSync("sub_1", "resend")).toMatchObject({
      metadata: { pendingReason: "account_link" },
    });
  });

  it("does not link unverified user email", async () => {
    const repository = new InMemorySubscriberRepository({
      subscribers: [subscriber()],
    });

    expect(
      await service(repository).linkToVerifiedUser({
        publicationId: "pub_1",
        email: "reader@example.com",
        userId: "user_1",
        emailVerified: false,
      }),
    ).toBeUndefined();
  });

  it("unsubscribes locally and suppresses marketing/product email", async () => {
    const repository = new InMemorySubscriberRepository({
      subscribers: [subscriber()],
    });
    await service(repository).updatePreferences({
      subscriberId: "sub_1",
      unsubscribe: true,
    });

    expect(repository.findSubscriberById("sub_1")).toMatchObject({
      status: "unsubscribed",
      unsubscribedAt: now,
    });
    expect(repository.findPreferences("sub_1")).toMatchObject({
      marketingEmailOptIn: false,
      productEmailOptIn: false,
    });
  });
});

describe("subscriber health states and admin operations", () => {
  it("marks bounces, complaints, and suppressions as marketing-suppressed", async () => {
    const repository = new InMemorySubscriberRepository({
      subscribers: [subscriber()],
    });
    const subscriberService = service(repository);
    const bounced = await subscriberService.updateStatus({
      subscriberId: "sub_1",
      status: "bounced",
      reason: "hard_bounce",
      provider: "resend",
    });

    expect(bounced).toMatchObject({
      status: "bounced",
      bouncedAt: now,
      metadata: { statusReason: "hard_bounce", statusProvider: "resend" },
    });
    expect(subscriberService.canReceiveMarketingEmail(bounced)).toBe(false);
    expect(isMarketingSuppressed("complained")).toBe(true);
    expect(isSyncRetryable("failed")).toBe(true);
  });

  it("parses import CSV and exports documented subscriber columns", async () => {
    const repository = new InMemorySubscriberRepository();
    const subscriberService = service(repository);
    const rows = parseSubscriberCsv(
      "email,name,status,source,marketingEmailOptIn\nnew@example.com,New Reader,active,migration,false",
    );
    const result = await subscriberService.importRows("pub_1", rows);
    const csv = buildSubscriberCsv(await subscriberService.search({ publicationId: "pub_1" }));

    expect(result).toMatchObject({ imported: 1, updated: 0, skipped: 0 });
    expect(repository.findPreferences("sub_1")).toMatchObject({
      marketingEmailOptIn: false,
    });
    expect(csv.split("\n")[0]).toBe(
      "id,email,name,status,source,userId,marketingEmailOptIn,productEmailOptIn,commentNotificationOptIn,syncStatus,syncProvider,createdAt,updatedAt",
    );
    expect(csv).toContain("new@example.com");
  });
});
