import type { EmailProviderKey, EmailSendResult } from "../email";
import { buildMagicLinkEmail, type EmailSendService } from "../email";
import { DEFAULT_MAGIC_LINK_TTL_MINUTES } from "./tokens";

export type MagicLinkDeliveryResult =
  | {
      status: "queued";
      provider: EmailProviderKey;
      providerMessageId?: string;
    }
  | {
      status: "skipped_duplicate";
      provider: EmailProviderKey;
      message: string;
    }
  | {
      status: "failed";
      provider?: EmailProviderKey;
      message: string;
    }
  | { status: "not_configured"; message: string };

export type MagicLinkEmailSender = Pick<EmailSendService, "sendTransactional">;

export type DeliverMagicLinkEmailInput = {
  email: string;
  magicLinkUrl: string;
  requestId: string;
  publicationId: string;
  siteName: string;
  siteUrl: string;
  sendService: MagicLinkEmailSender;
  requestedAt?: Date;
  expiresAt?: Date;
};

export async function deliverMagicLinkEmail(
  input: DeliverMagicLinkEmailInput,
): Promise<MagicLinkDeliveryResult> {
  try {
    const result = await input.sendService.sendTransactional({
      publicationId: input.publicationId,
      purpose: "magic_link",
      dedupeKey: magicLinkDedupeKey(input.requestId),
      to: { email: input.email },
      content: buildMagicLinkEmail({
        siteName: input.siteName,
        siteUrl: input.siteUrl,
        magicLinkUrl: input.magicLinkUrl,
        expiresInMinutes: magicLinkExpiresInMinutes(input.requestedAt, input.expiresAt),
      }),
      metadata: {
        purpose: "magic_link",
        magicLinkRequestId: input.requestId,
      },
    });

    return magicLinkDeliveryResult(result);
  } catch (error) {
    return {
      status: "failed",
      message: safeDeliveryError(error),
    };
  }
}

function magicLinkDeliveryResult(result: EmailSendResult): MagicLinkDeliveryResult {
  if (result.status === "skipped_duplicate") {
    return {
      status: "skipped_duplicate",
      provider: result.provider,
      message: result.skippedReason ?? "A magic-link email for this request was already accepted.",
    };
  }

  if (!result.accepted) {
    return {
      status: "failed",
      provider: result.provider,
      message: result.skippedReason ?? "The email provider did not accept the magic-link email.",
    };
  }

  return {
    status: "queued",
    provider: result.provider,
    providerMessageId: result.providerMessageId,
  };
}

function magicLinkDedupeKey(requestId: string) {
  return `auth:magic-link:${requestId}`;
}

function magicLinkExpiresInMinutes(requestedAt?: Date, expiresAt?: Date) {
  if (!requestedAt || !expiresAt) {
    return DEFAULT_MAGIC_LINK_TTL_MINUTES;
  }

  return Math.max(1, Math.ceil((expiresAt.getTime() - requestedAt.getTime()) / 60_000));
}

function safeDeliveryError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Magic-link email delivery failed.";
}
