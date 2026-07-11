import { Resend } from "resend";
import { EmailProviderConfigurationError, EmailProviderError } from "../errors";
import type {
  CreateEmailBroadcastInput,
  EmailAddressWithName,
  EmailAudience,
  EmailAudienceMembership,
  EmailAudienceMembershipInput,
  EmailBroadcast,
  EmailContact,
  EmailProvider,
  EmailProviderKey,
  EmailSegment,
  EmailSegmentMembership,
  EmailSegmentMembershipInput,
  EmailSendResult,
  SendEmailBroadcastInput,
  SendTransactionalEmailInput,
  UpdateEmailContactStatusInput,
  UpsertEmailAudienceInput,
  UpsertEmailContactInput,
  UpsertEmailSegmentInput,
} from "../types";

type ResendClient = {
  emails: {
    send(input: Record<string, unknown>): Promise<{ data?: { id?: string }; error?: unknown }>;
  };
  broadcasts?: {
    create(input: Record<string, unknown>): Promise<{ data?: { id?: string }; error?: unknown }>;
    send?(
      id: string,
      input?: Record<string, unknown>,
    ): Promise<{ data?: { id?: string }; error?: unknown }>;
  };
  contacts?: {
    create(input: Record<string, unknown>): Promise<{ data?: { id?: string }; error?: unknown }>;
    update(
      input: Record<string, unknown>,
    ): Promise<{ data?: { id?: string }; error?: unknown }>;
  };
  audiences?: {
    create(input: Record<string, unknown>): Promise<{ data?: { id?: string }; error?: unknown }>;
  };
};

export type ResendEmailProviderConfig = {
  apiKey: string;
  defaultFrom: EmailAddressWithName;
  defaultReplyTo?: EmailAddressWithName;
  defaultAudienceId?: string;
  testMode?: boolean;
};

export type ResendEmailProviderOptions = {
  client?: ResendClient;
  now?: () => Date;
};

export class ResendEmailProvider implements EmailProvider {
  readonly key: EmailProviderKey = "resend";
  readonly config: ResendEmailProviderConfig;

  private readonly client: ResendClient;
  private readonly now: () => Date;

  constructor(config: ResendEmailProviderConfig, options: ResendEmailProviderOptions = {}) {
    const missingFields = requiredConfigMissingFields(config);

    if (missingFields.length > 0) {
      throw new EmailProviderConfigurationError(
        `Resend email provider is missing required config: ${missingFields.join(", ")}.`,
        "resend",
      );
    }

    this.config = {
      ...config,
      apiKey: config.apiKey.trim(),
      defaultFrom: normalizeSender(config.defaultFrom),
      defaultReplyTo: config.defaultReplyTo ? normalizeSender(config.defaultReplyTo) : undefined,
      defaultAudienceId: config.defaultAudienceId?.trim(),
      testMode: config.testMode ?? false,
    };
    this.client = options.client ?? (new Resend(this.config.apiKey) as unknown as ResendClient);
    this.now = options.now ?? (() => new Date());
  }

  async upsertContact(input: UpsertEmailContactInput): Promise<EmailContact> {
    const audienceId = input.audienceIds?.[0] ?? this.config.defaultAudienceId;

    if (!audienceId) {
      throw new EmailProviderConfigurationError(
        "Resend contact upsert requires defaultAudienceId or input.audienceIds[0].",
        this.key,
      );
    }

    const payload = {
      audienceId,
      email: input.email.trim().toLowerCase(),
      firstName: input.name,
      unsubscribed: isProviderSuppressedStatus(input.status),
    };
    const existingContactId = input.providerContactId;
    const response = existingContactId
      ? await this.client.contacts?.update({ id: existingContactId, ...payload })
      : await this.client.contacts?.create(payload);
    const providerContactId = response?.data?.id ?? existingContactId;

    if (response?.error) {
      throw resendError("upsert contact", response.error);
    }

    if (!providerContactId) {
      throw new EmailProviderError("Resend did not return a contact id.", this.key);
    }

    const now = this.now();
    return {
      id: providerContactId,
      provider: this.key,
      publicationId: input.publicationId,
      subscriberId: input.subscriberId,
      userId: input.userId,
      email: payload.email,
      name: input.name,
      status: input.status ?? "active",
      audienceIds: input.audienceIds ?? [audienceId],
      segmentIds: input.segmentIds ?? [],
      fields: input.fields ?? {},
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateContactStatus(input: UpdateEmailContactStatusInput): Promise<EmailContact> {
    if (!input.contact.contactId) {
      throw new EmailProviderError("Resend contact status updates require contactId.", this.key);
    }

    const response = await this.client.contacts?.update({
      id: input.contact.contactId,
      unsubscribed: isProviderSuppressedStatus(input.status),
    });

    if (response?.error) {
      throw resendError("update contact status", response.error);
    }

    const now = this.now();
    return {
      id: input.contact.contactId,
      provider: this.key,
      publicationId: input.contact.publicationId ?? "",
      subscriberId: input.contact.subscriberId,
      email: input.contact.email ?? "",
      status: input.status,
      audienceIds: [],
      segmentIds: [],
      fields: {},
      createdAt: now,
      updatedAt: now,
    };
  }

  async upsertAudience(input: UpsertEmailAudienceInput): Promise<EmailAudience> {
    const providerAudienceId = input.providerAudienceId ?? input.id;
    const audiences = this.client.audiences;
    let providerCreatedAudienceId: string | undefined;

    if (!providerAudienceId) {
      if (!audiences?.create) {
        throw new EmailProviderError(
          "Resend audience creation is unavailable in the installed Resend client; no audience was created.",
          this.key,
        );
      }

      const response = await audiences.create({ name: input.name });

      if (response.error) {
        throw resendError("create audience", response.error);
      }

      providerCreatedAudienceId = response.data?.id;
    }

    const now = this.now();
    return {
      id: input.id ?? providerCreatedAudienceId ?? input.key,
      provider: this.key,
      publicationId: input.publicationId,
      key: input.key,
      name: input.name,
      description: input.description,
      status: input.status ?? "active",
      providerAudienceId: providerAudienceId ?? providerCreatedAudienceId,
      createdAt: now,
      updatedAt: now,
    };
  }

  async upsertSegment(_input: UpsertEmailSegmentInput): Promise<EmailSegment> {
    throw new EmailProviderError(
      "Resend segment upsert is not implemented by this adapter; no segment was created or updated.",
      this.key,
    );
  }

  async addContactToAudience(
    _input: EmailAudienceMembershipInput,
  ): Promise<EmailAudienceMembership> {
    throw new EmailProviderError(
      "Resend contact audience membership is managed by contact create/update; this adapter does not support a separate addContactToAudience operation.",
      this.key,
    );
  }

  async removeContactFromAudience(
    _input: EmailAudienceMembershipInput,
  ): Promise<EmailAudienceMembership> {
    throw new EmailProviderError(
      "Resend contact audience membership is managed by contact create/update; this adapter does not support a separate removeContactFromAudience operation.",
      this.key,
    );
  }

  async addContactToSegment(_input: EmailSegmentMembershipInput): Promise<EmailSegmentMembership> {
    throw new EmailProviderError(
      "Resend segment membership is not implemented by this adapter; sync segment rules through the Resend dashboard/API before enabling this workflow.",
      this.key,
    );
  }

  async removeContactFromSegment(
    _input: EmailSegmentMembershipInput,
  ): Promise<EmailSegmentMembership> {
    throw new EmailProviderError(
      "Resend segment membership is not implemented by this adapter; sync segment rules through the Resend dashboard/API before enabling this workflow.",
      this.key,
    );
  }

  async sendTransactional(input: SendTransactionalEmailInput): Promise<EmailSendResult> {
    const response = await this.client.emails.send({
      from: formatAddress(input.from ?? this.config.defaultFrom),
      to: normalizeRecipients(input.to).map(formatAddress),
      replyTo: input.replyTo
        ? formatAddress(input.replyTo)
        : this.config.defaultReplyTo
          ? formatAddress(this.config.defaultReplyTo)
          : undefined,
      subject: input.content.subject,
      html: input.content.html,
      text: input.content.text,
      headers: input.headers,
      tags: toResendTags(input.tags, input.metadata),
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.fileName,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });

    if (response.error) {
      throw resendError("send transactional email", response.error);
    }

    return {
      provider: this.key,
      intentId: input.intent.id,
      dedupeKey: input.intent.dedupeKey,
      status: "sent",
      accepted: true,
      providerMessageId: response.data?.id,
      sentAt: this.now(),
    };
  }

  async createBroadcast(input: CreateEmailBroadcastInput): Promise<EmailBroadcast> {
    if (input.scheduledAt) {
      throw new EmailProviderError(
        "Scheduled Resend broadcast orchestration is not implemented by this adapter yet; create a draft broadcast and schedule it through a dedicated workflow.",
        this.key,
      );
    }

    const segmentId = input.target.segmentIds?.[0] ?? input.target.audienceIds?.[0];

    if (!segmentId) {
      throw new EmailProviderError("Resend broadcasts require a segment or audience target.", this.key);
    }

    if (!this.client.broadcasts?.create) {
      throw new EmailProviderError(
        "Resend broadcast creation is unavailable in the installed Resend client; no broadcast draft was created.",
        this.key,
      );
    }

    const response = await this.client.broadcasts.create({
      segmentId,
      from: formatAddress(input.from ?? this.config.defaultFrom),
      replyTo: input.replyTo
        ? formatAddress(input.replyTo)
        : this.config.defaultReplyTo
          ? formatAddress(this.config.defaultReplyTo)
          : undefined,
      subject: input.content.subject,
      html: input.content.html,
      text: input.content.text,
    });

    if (response?.error) {
      throw resendError("create broadcast", response.error);
    }

    const now = this.now();
    return {
      id: input.key ?? response?.data?.id ?? cryptoRandomId("broadcast"),
      provider: this.key,
      publicationId: input.publicationId,
      key: input.key,
      status: "draft",
      from: input.from ?? this.config.defaultFrom,
      replyTo: input.replyTo ?? this.config.defaultReplyTo,
      content: input.content,
      target: input.target,
      providerBroadcastId: response?.data?.id,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };
  }

  async sendBroadcast(input: SendEmailBroadcastInput): Promise<EmailSendResult> {
    if (input.scheduledAt) {
      throw new EmailProviderError(
        "Scheduled Resend broadcast sending is not implemented by this adapter yet; send immediately or use a dedicated scheduler workflow.",
        this.key,
      );
    }

    if (!this.client.broadcasts?.send) {
      throw new EmailProviderError(
        "Resend broadcast sending is unavailable in the installed Resend client; no broadcast was sent.",
        this.key,
      );
    }

    const providerBroadcastId = input.providerBroadcastId ?? input.broadcastId;
    const response = await this.client.broadcasts.send(providerBroadcastId);

    if (response?.error) {
      throw resendError("send broadcast", response.error);
    }

    return {
      provider: this.key,
      intentId: input.intent.id,
      dedupeKey: input.intent.dedupeKey,
      status: "sent",
      accepted: true,
      broadcastId: input.broadcastId,
      providerBroadcastId: response?.data?.id ?? providerBroadcastId,
      sentAt: this.now(),
    };
  }
}

export function createResendEmailProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: ResendEmailProviderOptions = {},
) {
  if (env.NODE_ENV === "test" && env.RESEND_ALLOW_TEST_SENDS !== "true" && !options.client) {
    throw new EmailProviderConfigurationError(
      "Refusing to create a live Resend provider during tests. Inject a mock client or set RESEND_ALLOW_TEST_SENDS=true.",
      "resend",
    );
  }

  return new ResendEmailProvider(
    {
      apiKey: env.RESEND_API_KEY ?? "",
      defaultFrom: parseAddressEnv(env.RESEND_DEFAULT_FROM),
      defaultReplyTo: env.RESEND_DEFAULT_REPLY_TO
        ? parseAddressEnv(env.RESEND_DEFAULT_REPLY_TO)
        : undefined,
      defaultAudienceId: env.RESEND_DEFAULT_AUDIENCE_ID,
      testMode: env.NODE_ENV === "test",
    },
    options,
  );
}

function requiredConfigMissingFields(config: ResendEmailProviderConfig) {
  const missingFields: string[] = [];

  if (!config.apiKey?.trim()) {
    missingFields.push("apiKey");
  }

  if (!config.defaultFrom?.email?.trim()) {
    missingFields.push("defaultFrom.email");
  }

  return missingFields;
}

function normalizeSender(sender: EmailAddressWithName): EmailAddressWithName {
  return {
    email: sender.email.trim(),
    name: sender.name?.trim(),
  };
}

function normalizeRecipients(recipients: EmailAddressWithName | EmailAddressWithName[]) {
  return Array.isArray(recipients) ? recipients : [recipients];
}

function formatAddress(address: EmailAddressWithName) {
  return address.name ? `${address.name} <${address.email}>` : address.email;
}

function parseAddressEnv(value: string | undefined): EmailAddressWithName {
  if (!value) {
    return { email: "" };
  }

  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }

  return { email: value.trim() };
}

function toResendTags(tags: string[] | undefined, metadata: Record<string, unknown> | undefined) {
  const tagEntries = [
    ...(tags ?? []).map((tag) => [tag, "true"] as const),
    ...Object.entries(metadata ?? {}),
  ];

  return tagEntries
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== null)
    .map(([name, value]) => ({
      name: sanitizeTag(String(name)),
      value: sanitizeTag(String(value)),
    }));
}

function isProviderSuppressedStatus(status: string | undefined) {
  return (
    status === "unsubscribed" ||
    status === "bounced" ||
    status === "complained" ||
    status === "suppressed"
  );
}

function sanitizeTag(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
}

function resendError(operation: string, error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : JSON.stringify(error);

  return new EmailProviderError(`Resend failed to ${operation}: ${message}`, "resend");
}

function cryptoRandomId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2)}`;
}
