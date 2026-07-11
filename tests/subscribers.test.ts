import { describe, expect, it } from "vitest";
import {
  buildSubscriberCsv,
  InMemorySubscriberRepository,
  isMarketingSuppressed,
  isSyncRetryable,
  parseSubscriberCsv,
  ResendSubscriberSyncWorker,
  SubscriberService,
  type SubscriberPreferences,
  type SubscriberProviderSync,
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

function preferences(overrides: Partial<SubscriberPreferences> = {}): SubscriberPreferences {
  return {
    subscriberId: "sub_1",
    marketingEmailOptIn: true,
    productEmailOptIn: true,
    commentNotificationOptIn: true,
    metadata: {},
    updatedAt: now,
    ...overrides,
  };
}

function sync(overrides: Partial<SubscriberProviderSync> = {}): SubscriberProviderSync {
  return {
    id: "sync_1",
    subscriberId: "sub_1",
    provider: "resend",
    syncStatus: "pending",
    metadata: { pendingReason: "signup" },
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

  it("fails import rows with invalid status or boolean cells", async () => {
    const repository = new InMemorySubscriberRepository();
    const subscriberService = service(repository);
    const rows = parseSubscriberCsv(
      [
        "email,status,marketingEmailOptIn",
        "bad-status@example.com,paid,true",
        "bad-bool@example.com,active,maybe",
      ].join("\n"),
    );
    const result = await subscriberService.importRows("pub_1", rows);

    expect(result).toMatchObject({
      imported: 0,
      updated: 0,
      skipped: 2,
    });
    expect(result.errors).toMatchObject([
      {
        row: 2,
        code: "invalid_row",
        message: "Invalid subscriber status.",
      },
      {
        row: 3,
        code: "invalid_row",
        message: "Invalid boolean value for marketingEmailOptIn.",
      },
    ]);
    await expect(subscriberService.search({ publicationId: "pub_1" })).resolves.toEqual([]);
  });
});

describe("Resend subscriber sync worker", () => {
  it("syncs pending rows into the selected Resend audience and marks actual provider state synced", async () => {
    const repository = new InMemorySubscriberRepository({
      subscribers: [subscriber({ metadata: { name: "Reader", tierSlug: "founding" } })],
      preferences: [preferences()],
      syncs: [sync()],
    });
    const contacts: unknown[] = [];
    const worker = new ResendSubscriberSyncWorker(
      repository,
      {
        async upsertContact(input) {
          contacts.push(input);
          return {
            id: "contact_1",
            provider: "resend",
            publicationId: input.publicationId,
            subscriberId: input.subscriberId,
            email: input.email,
            status: input.status ?? "active",
            audienceIds: input.audienceIds?.slice(0, 1) ?? [],
            segmentIds: [],
            fields: input.fields ?? {},
            createdAt: now,
            updatedAt: now,
          };
        },
      },
      {
        paidAudienceId: "aud_paid",
        tierAudienceIds: { founding: "aud_founding" },
        now: () => now,
      },
    );

    await expect(worker.runPending()).resolves.toEqual({
      processed: 1,
      synced: 1,
      failed: 0,
    });
    expect(contacts[0]).toMatchObject({
      email: "reader@example.com",
      name: "Reader",
      audienceIds: ["aud_paid"],
    });
    expect(contacts[0]).not.toHaveProperty("segmentIds");
    expect(contacts[0]).not.toHaveProperty("fields");
    expect(repository.findProviderSync("sub_1", "resend")).toMatchObject({
      providerContactId: "contact_1",
      syncStatus: "synced",
      lastSyncedAt: now,
      lastError: undefined,
      metadata: {
        pendingReason: "signup",
        audienceIds: ["aud_paid"],
        syncedReason: "signup",
      },
    });
    expect(repository.findProviderSync("sub_1", "resend")?.metadata).not.toHaveProperty(
      "segmentIds",
    );
  });

  it("marks failed provider calls without requiring live Resend credentials", async () => {
    const repository = new InMemorySubscriberRepository({
      subscribers: [subscriber({ status: "suppressed" })],
      preferences: [preferences({ marketingEmailOptIn: false })],
      syncs: [sync()],
    });
    const worker = new ResendSubscriberSyncWorker(
      repository,
      {
        async upsertContact() {
          throw new Error("provider unavailable");
        },
      },
      {
        suppressedAudienceId: "aud_suppressed",
        now: () => now,
      },
    );

    await expect(worker.runPending()).resolves.toEqual({
      processed: 1,
      synced: 0,
      failed: 1,
    });
    expect(repository.findProviderSync("sub_1", "resend")).toMatchObject({
      syncStatus: "failed",
      lastError: "provider unavailable",
    });
  });

  it("sends suppressed provider status when local preferences opt out", async () => {
    const repository = new InMemorySubscriberRepository({
      subscribers: [subscriber({ status: "active" })],
      preferences: [preferences({ marketingEmailOptIn: false })],
      syncs: [sync()],
    });
    const contacts: unknown[] = [];
    const worker = new ResendSubscriberSyncWorker(
      repository,
      {
        async upsertContact(input) {
          contacts.push(input);
          return {
            id: "contact_1",
            provider: "resend",
            publicationId: input.publicationId,
            subscriberId: input.subscriberId,
            email: input.email,
            status: input.status ?? "active",
            audienceIds: input.audienceIds ?? [],
            segmentIds: [],
            fields: {},
            createdAt: now,
            updatedAt: now,
          };
        },
      },
      {
        suppressedAudienceId: "aud_suppressed",
        now: () => now,
      },
    );

    await expect(worker.runPending()).resolves.toMatchObject({
      synced: 1,
      failed: 0,
    });
    expect(contacts[0]).toMatchObject({
      email: "reader@example.com",
      status: "unsubscribed",
      audienceIds: ["aud_suppressed"],
    });
  });
});
