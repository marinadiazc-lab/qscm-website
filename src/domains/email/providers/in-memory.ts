import type {
  BroadcastEmailInput,
  EmailContact,
  EmailProvider,
  EmailSendResult,
  SendIntent,
  TransactionalEmailInput,
} from "../types";

export class InMemoryEmailProvider implements EmailProvider {
  readonly contacts = new Map<string, EmailContact>();
  readonly audienceMemberships = new Map<string, Set<string>>();
  readonly sends = new Map<string, SendIntent>();

  async upsertContact(contact: EmailContact): Promise<EmailContact> {
    const id = contact.id ?? contact.email.toLowerCase();
    const nextContact = { ...contact, id };
    this.contacts.set(id, nextContact);
    return nextContact;
  }

  async assignAudience(contactId: string, audienceId: string): Promise<void> {
    const memberships = this.audienceMemberships.get(contactId) ?? new Set();
    memberships.add(audienceId);
    this.audienceMemberships.set(contactId, memberships);
  }

  async removeAudience(contactId: string, audienceId: string): Promise<void> {
    this.audienceMemberships.get(contactId)?.delete(audienceId);
  }

  async sendTransactional(
    input: TransactionalEmailInput,
  ): Promise<EmailSendResult> {
    return this.recordSend(input.intent);
  }

  async sendBroadcast(input: BroadcastEmailInput): Promise<EmailSendResult> {
    return this.recordSend(input.intent);
  }

  private recordSend(intent: SendIntent): EmailSendResult {
    const existing = this.sends.get(intent.dedupeKey);

    if (existing?.status === "sent") {
      return {
        intent: {
          ...intent,
          status: "skipped_duplicate",
          providerMessageId: existing.providerMessageId,
        },
        providerMessageId: existing.providerMessageId,
      };
    }

    const providerMessageId = `memory_${this.sends.size + 1}`;
    const sentIntent: SendIntent = {
      ...intent,
      status: "sent",
      providerMessageId,
    };

    this.sends.set(intent.dedupeKey, sentIntent);

    return {
      intent: sentIntent,
      providerMessageId,
    };
  }
}
