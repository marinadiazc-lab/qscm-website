export type EmailAddress = {
  email: string;
  name?: string;
};

export type EmailContact = {
  id?: string;
  subscriberId?: string;
  email: string;
  name?: string;
  unsubscribed?: boolean;
  fields?: Record<string, string | number | boolean | null>;
};

export type EmailAudience = {
  id: string;
  name: string;
};

export type SendIntentStatus =
  | "pending"
  | "reserved"
  | "sending"
  | "sent"
  | "failed"
  | "suppressed"
  | "skipped_duplicate";

export type SendIntent = {
  id: string;
  dedupeKey: string;
  status: SendIntentStatus;
  providerMessageId?: string;
  error?: string;
};

export type TransactionalEmailInput = {
  intent: SendIntent;
  to: EmailAddress[];
  from?: EmailAddress;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: EmailAddress;
};

export type BroadcastEmailInput = {
  intent: SendIntent;
  audienceId: string;
  from?: EmailAddress;
  subject: string;
  text?: string;
  html?: string;
};

export type EmailSendResult = {
  intent: SendIntent;
  providerMessageId?: string;
};

export interface EmailProvider {
  upsertContact(contact: EmailContact): Promise<EmailContact>;
  assignAudience(contactId: string, audienceId: string): Promise<void>;
  removeAudience(contactId: string, audienceId: string): Promise<void>;
  sendTransactional(input: TransactionalEmailInput): Promise<EmailSendResult>;
  sendBroadcast(input: BroadcastEmailInput): Promise<EmailSendResult>;
}
