import type {
  EmailDeliveryLog,
  EmailProviderEvent,
  EmailProviderKey,
  EmailSubscriberStatus,
} from "./types";

export type EmailEventSubscriberUpdater = (input: {
  email?: string;
  subscriberId?: string;
  status: EmailSubscriberStatus;
  reason: string;
}) => Promise<void> | void;

export type EmailEventLogWriter = (
  log: Omit<EmailDeliveryLog, "id" | "createdAt">,
) => Promise<EmailDeliveryLog> | EmailDeliveryLog;

export class EmailProviderEventProcessor {
  private readonly processedEventIds = new Set<string>();

  constructor(
    private readonly options: {
      updateSubscriberStatus?: EmailEventSubscriberUpdater;
      logDelivery?: EmailEventLogWriter;
    } = {},
  ) {}

  async process(event: EmailProviderEvent) {
    if (this.processedEventIds.has(event.id)) {
      return { processed: false, reason: "duplicate" as const };
    }

    this.processedEventIds.add(event.id);

    const status = statusForEvent(event.type);
    if (status) {
      await this.options.updateSubscriberStatus?.({
        email: event.recipientEmail,
        subscriberId: event.subscriberId,
        status,
        reason: event.type,
      });
    }

    await this.options.logDelivery?.({
      provider: event.provider,
      providerMessageId: event.providerMessageId,
      broadcastId: event.broadcastId,
      subscriberId: event.subscriberId,
      recipientEmail: event.recipientEmail,
      eventType: event.type,
      level: levelForEvent(event.type),
      message: messageForEvent(event.type),
      metadata: {
        providerEventId: event.id,
      },
    });

    return { processed: true as const, reason: "processed" as const };
  }
}

export function parseResendWebhookEvent(payload: Record<string, unknown>): EmailProviderEvent {
  const data = isRecord(payload.data) ? payload.data : {};
  const email = isRecord(data.email) ? data.email : data;
  const createdAt = typeof payload.created_at === "string" ? payload.created_at : undefined;

  return {
    id: String(payload.id ?? `${payload.type}:${email.id ?? cryptoRandomId()}`),
    provider: "resend" as EmailProviderKey,
    type: String(payload.type ?? "unknown"),
    createdAt: createdAt ? new Date(createdAt) : new Date(),
    providerMessageId: stringValue(email.id ?? email.email_id ?? data.email_id),
    recipientEmail: stringValue(email.to ?? email.recipient ?? data.recipient),
    payload,
  };
}

function statusForEvent(type: string): EmailSubscriberStatus | undefined {
  switch (type) {
    case "contact.unsubscribed":
      return "unsubscribed";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.suppressed":
      return "suppressed";
    default:
      return undefined;
  }
}

function levelForEvent(type: string) {
  if (type === "email.failed" || type === "email.bounced" || type === "email.complained") {
    return "error" as const;
  }

  if (type === "email.delivery_delayed" || type === "email.suppressed") {
    return "warning" as const;
  }

  return "info" as const;
}

function messageForEvent(type: string) {
  switch (type) {
    case "email.delivered":
      return "Resend reported delivery to the recipient mail server.";
    case "email.failed":
      return "Resend reported a send failure.";
    case "email.bounced":
      return "Recipient mail server permanently rejected the email.";
    case "email.complained":
      return "Recipient marked the message as spam.";
    case "contact.unsubscribed":
      return "Recipient unsubscribed through the email provider.";
    default:
      return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  if (Array.isArray(value)) {
    return stringValue(value[0]);
  }

  return typeof value === "string" ? value : undefined;
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2);
}
