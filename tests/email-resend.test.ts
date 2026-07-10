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
    expect(await repository.listDeliveryLogs()).toHaveLength(2);
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
});
