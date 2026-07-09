import { EmailProviderConfigurationError, EmailProviderNotConfiguredError } from "../errors";
import type {
  CreateEmailBroadcastInput,
  EmailAddressWithName,
  EmailAudience,
  EmailAudienceMembership,
  EmailAudienceMembershipInput,
  EmailBroadcast,
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
  EmailContact,
} from "../types";

export type ResendEmailProviderConfig = {
  apiKey: string;
  defaultFrom: EmailAddressWithName;
  defaultReplyTo?: EmailAddressWithName;
  defaultAudienceId?: string;
};

export class ResendEmailProvider implements EmailProvider {
  readonly key: EmailProviderKey = "resend";
  readonly config: ResendEmailProviderConfig;

  constructor(config: ResendEmailProviderConfig) {
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
    };
  }

  async upsertContact(_input: UpsertEmailContactInput): Promise<EmailContact> {
    this.notConfigured("upsertContact");
  }

  async updateContactStatus(_input: UpdateEmailContactStatusInput): Promise<EmailContact> {
    this.notConfigured("updateContactStatus");
  }

  async upsertAudience(_input: UpsertEmailAudienceInput): Promise<EmailAudience> {
    this.notConfigured("upsertAudience");
  }

  async upsertSegment(_input: UpsertEmailSegmentInput): Promise<EmailSegment> {
    this.notConfigured("upsertSegment");
  }

  async addContactToAudience(
    _input: EmailAudienceMembershipInput,
  ): Promise<EmailAudienceMembership> {
    this.notConfigured("addContactToAudience");
  }

  async removeContactFromAudience(
    _input: EmailAudienceMembershipInput,
  ): Promise<EmailAudienceMembership> {
    this.notConfigured("removeContactFromAudience");
  }

  async addContactToSegment(_input: EmailSegmentMembershipInput): Promise<EmailSegmentMembership> {
    this.notConfigured("addContactToSegment");
  }

  async removeContactFromSegment(
    _input: EmailSegmentMembershipInput,
  ): Promise<EmailSegmentMembership> {
    this.notConfigured("removeContactFromSegment");
  }

  async sendTransactional(_input: SendTransactionalEmailInput): Promise<EmailSendResult> {
    this.notConfigured("sendTransactional");
  }

  async createBroadcast(_input: CreateEmailBroadcastInput): Promise<EmailBroadcast> {
    this.notConfigured("createBroadcast");
  }

  async sendBroadcast(_input: SendEmailBroadcastInput): Promise<EmailSendResult> {
    this.notConfigured("sendBroadcast");
  }

  private notConfigured(operation: string): never {
    throw new EmailProviderNotConfiguredError(
      `ResendEmailProvider.${operation} is a skeleton only. Resend API calls are intentionally disabled until the adapter is wired; no email was sent.`,
      this.key,
    );
  }
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
