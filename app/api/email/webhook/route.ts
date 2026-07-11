import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import {
  EmailProviderEventProcessor,
  EmailProviderWebhookHandler,
  parseResendWebhookEvent,
  verifyResendWebhookSignature,
  type EmailSubscriberStatus,
} from "@/src/domains/email";
import { DrizzleEmailSendIntentRepository } from "@/src/domains/email/repository";
import { DatabaseSubscriberRepository } from "@/src/domains/subscribers/database-repository";
import { getDefaultPublicationId } from "@/src/domains/subscribers/runtime";
import { SubscriberService } from "@/src/domains/subscribers/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();

  try {
    const svixId = request.headers.get("svix-id") ?? undefined;
    verifyResendWebhookSignature(
      rawBody,
      {
        "svix-id": svixId,
        "svix-timestamp": request.headers.get("svix-timestamp") ?? undefined,
        "svix-signature": request.headers.get("svix-signature") ?? undefined,
      },
      process.env.RESEND_WEBHOOK_SECRET,
    );

    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const event = parseResendWebhookEvent(payload, { eventId: svixId });
    const emailRepository = new DrizzleEmailSendIntentRepository();
    const subscriberRepository = new DatabaseSubscriberRepository();
    const subscriberService = new SubscriberService(subscriberRepository);
    const handler = new EmailProviderWebhookHandler({
      repository: emailRepository,
      processor: new EmailProviderEventProcessor({
        logDelivery: (log) => emailRepository.logDelivery(log),
        updateSubscriberStatus: async (input) => {
          await updateLocalSubscriberStatus({
            repository: subscriberRepository,
            service: subscriberService,
            email: input.email,
            subscriberId: input.subscriberId,
            status: input.status,
            reason: input.reason,
            occurredAt: event.createdAt,
          });
        },
      }),
      payloadHash: hashPayload,
    });

    const result = await handler.handle(event);

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Email webhook processing failed.",
      },
      { status: 400 },
    );
  }
}

async function updateLocalSubscriberStatus(input: {
  repository: DatabaseSubscriberRepository;
  service: SubscriberService;
  email?: string;
  subscriberId?: string;
  status: EmailSubscriberStatus;
  reason: string;
  occurredAt: Date;
}) {
  const subscriberId =
    input.subscriberId ??
    (input.email
      ? (
          await input.repository.findSubscriberByEmail(
            await getDefaultPublicationId(),
            input.email,
          )
        )?.id
      : undefined);

  if (!subscriberId) {
    return;
  }

  await input.service.updateStatus({
    subscriberId,
    status: input.status,
    provider: "resend",
    reason: input.reason,
    occurredAt: input.occurredAt,
  });
}

function hashPayload(payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
