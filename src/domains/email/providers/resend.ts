import { EmailProviderNotConfiguredError } from "../errors";
import type {
  BroadcastEmailInput,
  EmailContact,
  EmailProvider,
  EmailSendResult,
  TransactionalEmailInput,
} from "../types";

export type ResendEmailProviderConfig = {
  apiKey?: string;
  defaultFrom?: {
    email?: string;
    name?: string;
  };
};

export class ResendEmailProvider implements EmailProvider {
  private readonly missingConfig: string[];

  constructor(private readonly config: ResendEmailProviderConfig) {
    this.missingConfig = [
      !config.apiKey ? "apiKey" : undefined,
      !config.defaultFrom?.email ? "defaultFrom.email" : undefined,
    ].filter((value): value is string => Boolean(value));
  }

  async upsertContact(_contact: EmailContact): Promise<EmailContact> {
    this.assertConfigured();
    throw this.notImplemented();
  }

  async assignAudience(_contactId: string, _audienceId: string): Promise<void> {
    this.assertConfigured();
    throw this.notImplemented();
  }

  async removeAudience(_contactId: string, _audienceId: string): Promise<void> {
    this.assertConfigured();
    throw this.notImplemented();
  }

  async sendTransactional(
    _input: TransactionalEmailInput,
  ): Promise<EmailSendResult> {
    this.assertConfigured();
    throw this.notImplemented();
  }

  async sendBroadcast(_input: BroadcastEmailInput): Promise<EmailSendResult> {
    this.assertConfigured();
    throw this.notImplemented();
  }

  private assertConfigured() {
    if (this.missingConfig.length > 0) {
      throw new EmailProviderNotConfiguredError("Resend", this.missingConfig);
    }
  }

  private notImplemented() {
    return new Error(
      "ResendEmailProvider is a safe stub. Add the Resend API client before real sends or contact sync.",
    );
  }
}
