import { describe, expect, it, vi } from "vitest";
import {
  buildMagicLinkEmail,
  buildReceiptEmail,
  buildSubscriptionUpdateEmail,
  createNewsletterBroadcastFromPost,
  createResendEmailProviderFromEnv,
  EmailProviderEventProcessor,
  EmailSendService,
  InMemoryEmailSendIntentRepository,
  parseResendWebhookEvent,
  ResendEmailProvider,
  type EmailSendIntentReference,
} from "../src/domains/email";
import type { PostSummary } from "../src/content/posts";

const now = new Date("2026-07-10T12:00:00.000Z");

describe("transactional email templates", () => {
  it("renders magic-link HTML and text with expiration language", () => {
    const email = buildMagicLinkEmail({
      siteName: "QSCM",
      siteUrl: "https://qscm.example",
      magicLinkUrl: "https://qscm.example/auth/magic?token=abc",
      expiresInMinutes: 15,
    });

    expect(email.subject).toBe("Sign in to QSCM");
    expect(email.text).toContain("https://qscm.example/auth/magic?token=abc");
    expect(email.text).toContain("expires in 15 minutes");
    expect(email.html).toContain("Sign in");
  });

  it("renders launch transactional templates with text and HTML fallbacks", () => {
    const receipt = buildReceiptEmail({
      siteName: "QSCM",
      siteUrl: "https://qscm.example",
      planName: "Paid",
      amountLabel: "$10.00",
    });
    const subscription = buildSubscriptionUpdateEmail({
      siteName: "QSCM",
      siteUrl: "https://qscm.example",
      headline: "Subscription updated",
      body: "Your plan changed.",
      manageUrl: "https://qscm.example/account",
    });

    expect(receipt.text).toContain("$10.00");
    expect(receipt.html).toContain("Receipt");
    expect(subscription.text).toContain("https://qscm.example/account");
    expect(subscription.html).toContain("Manage subscription");
  });
});

describe("Resend provider", () => {
  const intent = (id = "intent_1", dedupeKey = "dedupe_1"): EmailSendIntentReference => ({
    id,
    dedupeKey,
  });

  it("maps transactional sends to the Resend email API", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "email_123" } });
    const provider = new ResendEmailProvider(
      {
        apiKey: "re_test",
        defaultFrom: { email: "hello@example.com", name: "QSCM" },
      },
      {
        now: () => now,
        client: {
          emails: { send },
        },
      },
    );

    const result = await provider.sendTransactional({
      publicationId: "pub_1",
      purpose: "magic_link",
      intent: intent(),
      to: { email: "reader@example.com", name: "Reader" },
      content: { subject: "Hello", html: "<p>Hello</p>", text: "Hello" },
      metadata: { purpose: "magic_link" },
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "QSCM <hello@example.com>",
        to: ["Reader <reader@example.com>"],
        subject: "Hello",
        html: "<p>Hello</p>",
        text: "Hello",
      }),
    );
    expect(result).toMatchObject({
      accepted: true,
      providerMessageId: "email_123",
      status: "sent",
    });
  });

  it("refuses live provider construction in tests without an injected client", () => {
    expect(() =>
      createResendEmailProviderFromEnv({
        NODE_ENV: "test",
        RESEND_API_KEY: "re_test",
        RESEND_DEFAULT_FROM: "QSCM <hello@example.com>",
      } as NodeJS.ProcessEnv),
    ).toThrow(/Refusing to create a live Resend provider during tests/);
  });

  it("keeps suppressed contacts unsubscribed during Resend sync", async () => {
    const create = vi.fn().mockResolvedValue({ data: { id: "contact_1" } });
    const provider = new ResendEmailProvider(
      {
        apiKey: "re_test",
        defaultFrom: { email: "hello@example.com" },
        defaultAudienceId: "audience_1",
      },
      {
        client: {
          emails: { send: vi.fn() },
          contacts: { create, update: vi.fn() },
        },
      },
    );

    await provider.upsertContact({
      publicationId: "pub_1",
      email: "reader@example.com",
      status: "bounced",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "reader@example.com",
        unsubscribed: true,
      }),
    );
  });

  it("does not pretend unsupported membership operations succeeded", async () => {
    const provider = new ResendEmailProvider(
      {
        apiKey: "re_test",
        defaultFrom: { email: "hello@example.com" },
      },
      {
        client: {
          emails: { send: vi.fn() },
        },
      },
    );

    await expect(
      provider.addContactToAudience({
        contact: { contactId: "contact_1" },
        audienceId: "audience_1",
      }),
    ).rejects.toThrow(/does not support a separate addContactToAudience/);
    await expect(
      provider.addContactToSegment({
        contact: { contactId: "contact_1" },
        segmentId: "segment_1",
      }),
    ).rejects.toThrow(/Segment membership is not implemented/i);
  });

  it("creates audiences through Resend when audience creation is available", async () => {
    const create = vi.fn().mockResolvedValue({ data: { id: "audience_1" } });
    const provider = new ResendEmailProvider(
      {
        apiKey: "re_test",
        defaultFrom: { email: "hello@example.com" },
      },
      {
        now: () => now,
        client: {
          emails: { send: vi.fn() },
          audiences: { create },
        },
      },
    );

    const audience = await provider.upsertAudience({
      publicationId: "pub_1",
      key: "weekly",
      name: "Weekly readers",
    });

    expect(create).toHaveBeenCalledWith({ name: "Weekly readers" });
    expect(audience).toMatchObject({
      id: "audience_1",
      providerAudienceId: "audience_1",
      key: "weekly",
      name: "Weekly readers",
    });
  });

  it("rejects audience creation when the Resend client cannot create audiences", async () => {
    const provider = new ResendEmailProvider(
      {
        apiKey: "re_test",
        defaultFrom: { email: "hello@example.com" },
      },
      {
        client: {
          emails: { send: vi.fn() },
        },
      },
    );

    await expect(
      provider.upsertAudience({
        publicationId: "pub_1",
        key: "weekly",
        name: "Weekly readers",
      }),
    ).rejects.toThrow(/audience creation is unavailable/i);
  });

  it("rejects segment upserts instead of fabricating a Resend segment", async () => {
    const provider = new ResendEmailProvider(
      {
        apiKey: "re_test",
        defaultFrom: { email: "hello@example.com" },
      },
      {
        client: {
          emails: { send: vi.fn() },
        },
      },
    );

    await expect(
      provider.upsertSegment({
        publicationId: "pub_1",
        audienceId: "audience_1",
        key: "paid",
        name: "Paid readers",
      }),
    ).rejects.toThrow(/segment upsert is not implemented/i);
  });

  it("creates draft broadcasts and rejects incomplete scheduled orchestration", async () => {
    const create = vi.fn().mockResolvedValue({ data: { id: "broadcast_1" } });
    const provider = new ResendEmailProvider(
      {
        apiKey: "re_test",
        defaultFrom: { email: "hello@example.com" },
      },
      {
        now: () => now,
        client: {
          emails: { send: vi.fn() },
          broadcasts: { create },
        },
      },
    );

    const draft = await provider.createBroadcast({
      publicationId: "pub_1",
      content: { subject: "Newsletter", html: "<p>Hello</p>", text: "Hello" },
      target: { segmentIds: ["segment_1"] },
    });

    expect(draft).toMatchObject({ status: "draft", providerBroadcastId: "broadcast_1" });
    expect(create).toHaveBeenCalledWith(
      expect.not.objectContaining({
        scheduledAt: expect.any(String),
      }),
    );
    await expect(
      provider.createBroadcast({
        publicationId: "pub_1",
        content: { subject: "Newsletter", html: "<p>Hello</p>", text: "Hello" },
        target: { segmentIds: ["segment_1"] },
        scheduledAt: new Date("2026-07-11T12:00:00.000Z"),
      }),
    ).rejects.toThrow(/Scheduled Resend broadcast orchestration is not implemented/);
  });

  it("sends broadcasts through Resend when broadcast send is available", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "broadcast_1" } });
    const provider = new ResendEmailProvider(
      {
        apiKey: "re_test",
        defaultFrom: { email: "hello@example.com" },
      },
      {
        now: () => now,
        client: {
          emails: { send: vi.fn() },
          broadcasts: { create: vi.fn(), send },
        },
      },
    );

    const result = await provider.sendBroadcast({
      intent: intent(),
      broadcastId: "broadcast_1",
    });

    expect(send).toHaveBeenCalledWith("broadcast_1");
    expect(result).toMatchObject({
      accepted: true,
      providerBroadcastId: "broadcast_1",
      status: "sent",
    });
  });

  it("rejects draft broadcast creation when the Resend client does not expose broadcast create", async () => {
    const provider = new ResendEmailProvider(
      {
        apiKey: "re_test",
        defaultFrom: { email: "hello@example.com" },
      },
      {
        client: {
          emails: { send: vi.fn() },
        },
      },
    );

    await expect(
      provider.createBroadcast({
        publicationId: "pub_1",
        content: { subject: "Newsletter", html: "<p>Hello</p>", text: "Hello" },
        target: { segmentIds: ["segment_1"] },
      }),
    ).rejects.toThrow(/broadcast creation is unavailable/i);
  });

  it("rejects broadcast sends when the Resend client does not expose broadcast send", async () => {
    const provider = new ResendEmailProvider(
      {
        apiKey: "re_test",
        defaultFrom: { email: "hello@example.com" },
      },
      {
        client: {
          emails: { send: vi.fn() },
          broadcasts: { create: vi.fn() },
        },
      },
    );

    await expect(
      provider.sendBroadcast({
        intent: intent(),
        broadcastId: "broadcast_1",
      }),
    ).rejects.toThrow(/broadcast sending is unavailable/i);
  });
});

describe("email send service", () => {
  it("persists send intents and records skipped duplicate sends", async () => {
    const provider = {
      key: "in_memory",
      sendTransactional: vi.fn().mockResolvedValue({
        provider: "in_memory",
        intentId: "intent_1",
        dedupeKey: "magic:reader",
        status: "sent",
        accepted: true,
        providerMessageId: "message_1",
        sentAt: now,
      }),
      upsertContact: vi.fn(),
      updateContactStatus: vi.fn(),
      upsertAudience: vi.fn(),
      upsertSegment: vi.fn(),
      addContactToAudience: vi.fn(),
      removeContactFromAudience: vi.fn(),
      addContactToSegment: vi.fn(),
      removeContactFromSegment: vi.fn(),
      createBroadcast: vi.fn(),
      sendBroadcast: vi.fn(),
    };
    const repository = new InMemoryEmailSendIntentRepository(() => now);
    const service = new EmailSendService(repository, provider);

    const input = {
      publicationId: "pub_1",
      purpose: "magic_link" as const,
      dedupeKey: "magic:reader",
      to: { email: "reader@example.com" },
      content: { subject: "Sign in", text: "Use this link." },
    };
    const first = await service.sendTransactional(input);
    const duplicate = await service.sendTransactional(input);

    expect(first.accepted).toBe(true);
    expect(duplicate).toMatchObject({ accepted: false, status: "skipped_duplicate" });
    expect(provider.sendTransactional).toHaveBeenCalledTimes(1);
    expect(await repository.listIntents()).toMatchObject([
      {
        status: "sent",
        providerMessageId: "message_1",
      },
    ]);
    expect(await repository.listDeliveryLogs()).toHaveLength(2);
  });

  it("does not overwrite a failed original intent on duplicate attempts", async () => {
    const provider = {
      key: "in_memory",
      sendTransactional: vi.fn().mockRejectedValue(new Error("Provider down")),
      upsertContact: vi.fn(),
      updateContactStatus: vi.fn(),
      upsertAudience: vi.fn(),
      upsertSegment: vi.fn(),
      addContactToAudience: vi.fn(),
      removeContactFromAudience: vi.fn(),
      addContactToSegment: vi.fn(),
      removeContactFromSegment: vi.fn(),
      createBroadcast: vi.fn(),
      sendBroadcast: vi.fn(),
    };
    const repository = new InMemoryEmailSendIntentRepository(() => now);
    const service = new EmailSendService(repository, provider);
    const input = {
      publicationId: "pub_1",
      purpose: "magic_link" as const,
      dedupeKey: "magic:failed",
      to: { email: "reader@example.com" },
      content: { subject: "Sign in", text: "Use this link." },
    };

    await expect(service.sendTransactional(input)).rejects.toThrow("Provider down");
    const duplicate = await service.sendTransactional(input);

    expect(duplicate).toMatchObject({ accepted: false, status: "skipped_duplicate" });
    expect(provider.sendTransactional).toHaveBeenCalledTimes(1);
    expect(await repository.listIntents()).toMatchObject([
      {
        status: "failed",
        errorMessage: "Provider down",
      },
    ]);
  });
});

describe("newsletter broadcasts", () => {
  it("creates an email-ready broadcast from post newsletter metadata", () => {
    const post: PostSummary = {
      slug: "welcome",
      title: "Welcome",
      excerpt: "The first note.",
      author: "QSCM",
      status: "published",
      publicationState: "published",
      visibility: "free_subscribers",
      accessRequirement: {
        visibility: "free_subscribers",
        rule: "free_subscriber",
        requiresAuthentication: true,
        requiresPaidSubscription: false,
        allowedTierIds: [],
      },
      tierIds: [],
      tags: [],
      visibilityLabel: "Free subscribers",
      publishedAt: now,
      publishedAtLabel: "Jul 10, 2026",
      seo: {},
      media: [],
      newsletter: {
        enabled: true,
        subject: "A note for subscribers",
      },
    };

    const broadcast = createNewsletterBroadcastFromPost(post, {
      siteName: "QSCM",
      siteUrl: "https://qscm.example",
      defaultPublicationId: "pub_1",
      audienceIds: {
        public: "aud_public",
        free_subscribers: "aud_free",
        paid_any: "aud_paid",
      },
    });

    expect(broadcast).toMatchObject({
      publicationId: "pub_1",
      key: "post:welcome",
      target: { audienceIds: ["aud_free"] },
      content: { subject: "A note for subscribers" },
    });
    expect(broadcast?.content.html).toContain("RESEND_UNSUBSCRIBE_URL");
  });
});

describe("provider events", () => {
  it("dedupes webhook events and maps suppressing events to subscriber status", async () => {
    const updateSubscriberStatus = vi.fn();
    const logDelivery = vi.fn((log) => ({ id: "log_1", createdAt: now, ...log }));
    const processor = new EmailProviderEventProcessor({
      updateSubscriberStatus,
      logDelivery,
    });
    const event = parseResendWebhookEvent({
      id: "evt_1",
      type: "email.bounced",
      created_at: now.toISOString(),
      data: { email: { id: "email_1", to: ["reader@example.com"] } },
    });

    const first = await processor.process(event);
    const duplicate = await processor.process(event);

    expect(first).toEqual({ processed: true, reason: "processed" });
    expect(duplicate).toEqual({ processed: false, reason: "duplicate" });
    expect(updateSubscriberStatus).toHaveBeenCalledWith({
      email: "reader@example.com",
      subscriberId: undefined,
      status: "bounced",
      reason: "email.bounced",
    });
    expect(logDelivery).toHaveBeenCalledTimes(1);
  });

  it("maps Resend contact.updated unsubscribes using contact payload email", async () => {
    const updateSubscriberStatus = vi.fn();
    const processor = new EmailProviderEventProcessor({
      updateSubscriberStatus,
    });
    const unsubscribed = parseResendWebhookEvent({
      type: "contact.updated",
      created_at: now.toISOString(),
      data: {
        id: "contact_1",
        email: "reader@example.com",
        unsubscribed: true,
      },
    });
    const profileOnlyUpdate = parseResendWebhookEvent({
      type: "contact.updated",
      created_at: new Date(now.getTime() + 1000).toISOString(),
      data: {
        id: "contact_1",
        email: "reader@example.com",
        unsubscribed: false,
        first_name: "Reader",
      },
    });

    await processor.process(unsubscribed);
    await processor.process(profileOnlyUpdate);

    expect(unsubscribed.id).not.toBe(profileOnlyUpdate.id);
    expect(updateSubscriberStatus).toHaveBeenCalledTimes(1);
    expect(updateSubscriberStatus).toHaveBeenCalledWith({
      email: "reader@example.com",
      subscriberId: undefined,
      status: "unsubscribed",
      reason: "contact.updated",
    });
  });
});
