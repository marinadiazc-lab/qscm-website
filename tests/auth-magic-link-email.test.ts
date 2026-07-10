import { describe, expect, it, vi } from "vitest";

import { deliverMagicLinkEmail } from "../src/domains/auth";
import { EmailSendService, InMemoryEmailProvider, InMemoryEmailSendIntentRepository } from "../src/domains/email";

const now = new Date("2026-07-10T12:00:00.000Z");

function magicLinkInput(
  sendService: Pick<EmailSendService, "sendTransactional">,
  overrides: Partial<Parameters<typeof deliverMagicLinkEmail>[0]> = {},
) {
  return {
    email: "Reader@Example.com",
    magicLinkUrl: "https://qscm.example/api/auth/magic-link/consume?token=token_1",
    requestId: "magic_1",
    publicationId: "pub_1",
    siteName: "QSCM",
    siteUrl: "https://qscm.example",
    requestedAt: now,
    expiresAt: new Date("2026-07-10T12:15:00.000Z"),
    sendService,
    ...overrides,
  };
}

describe("magic-link email delivery", () => {
  it("sends magic-link email through a durable send intent", async () => {
    const repository = new InMemoryEmailSendIntentRepository(() => now);
    const provider = new InMemoryEmailProvider({ now: () => now });
    const sendService = new EmailSendService(repository, provider);

    const result = await deliverMagicLinkEmail(magicLinkInput(sendService));

    expect(result).toMatchObject({
      status: "queued",
      provider: "in_memory",
    });
    expect(provider.listSentResults()).toHaveLength(1);
    expect(provider.listSentResults()[0]).toMatchObject({
      dedupeKey: "auth:magic-link:magic_1",
      status: "sent",
    });
    await expect(repository.listIntents()).resolves.toMatchObject([
      {
        publicationId: "pub_1",
        kind: "transactional",
        dedupeKey: "auth:magic-link:magic_1",
        recipientEmail: "Reader@Example.com",
        status: "sent",
      },
    ]);
  });

  it("skips duplicate magic-link email sends for the same request", async () => {
    const repository = new InMemoryEmailSendIntentRepository(() => now);
    const provider = new InMemoryEmailProvider({ now: () => now });
    const sendService = new EmailSendService(repository, provider);

    await deliverMagicLinkEmail(magicLinkInput(sendService));
    const duplicate = await deliverMagicLinkEmail(magicLinkInput(sendService));

    expect(duplicate).toMatchObject({
      status: "skipped_duplicate",
      provider: "in_memory",
    });
    expect(provider.listSentResults()).toHaveLength(1);
    await expect(repository.listDeliveryLogs()).resolves.toHaveLength(2);
  });

  it("returns a safe failed result when the provider send fails", async () => {
    const sendService = {
      sendTransactional: vi.fn().mockRejectedValue(new Error("Resend is unavailable")),
    };

    const result = await deliverMagicLinkEmail(magicLinkInput(sendService));

    expect(result).toEqual({
      status: "failed",
      message: "Resend is unavailable",
    });
  });
});
