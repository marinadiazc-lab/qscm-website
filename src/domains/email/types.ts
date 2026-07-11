export type EmailProviderKey = "resend" | "in_memory" | "kit" | (string & {});

export type EmailPublicationId = string;
export type EmailSubscriberId = string;
export type EmailUserId = string;
export type EmailProviderContactId = string;
export type EmailAudienceId = string;
export type EmailSegmentId = string;
export type EmailBroadcastId = string;
export type EmailProviderMessageId = string;
export type EmailSendIntentId = string;
export type EmailDedupeKey = string;
export type EmailAddress = string;

export type EmailCustomFieldValue = string | number | boolean | Date | null;
export type EmailCustomFields = Record<string, EmailCustomFieldValue>;
export type EmailMetadata = Record<string, string | number | boolean | null>;

export type EmailSubscriberStatus =
  | "active"
  | "unsubscribed"
  | "bounced"
  | "complained"
  | "suppressed";

export type EmailListStatus = "active" | "archived";

export type EmailAddressWithName = {
  email: EmailAddress;
  name?: string;
};

export type EmailSubscriber = {
  id: EmailSubscriberId;
  publicationId: EmailPublicationId;
  email: EmailAddress;
  name?: string;
  userId?: EmailUserId;
  status: EmailSubscriberStatus;
  source?: string;
  providerContactId?: EmailProviderContactId;
  fields?: EmailCustomFields;
  createdAt?: Date;
  updatedAt?: Date;
};

export type EmailContact = {
  id: EmailProviderContactId;
  provider: EmailProviderKey;
  publicationId: EmailPublicationId;
  subscriberId?: EmailSubscriberId;
  userId?: EmailUserId;
  email: EmailAddress;
  name?: string;
  status: EmailSubscriberStatus;
  audienceIds: EmailAudienceId[];
  segmentIds: EmailSegmentId[];
  fields: EmailCustomFields;
  createdAt: Date;
  updatedAt: Date;
};

export type UpsertEmailContactInput = {
  publicationId: EmailPublicationId;
  subscriberId?: EmailSubscriberId;
  userId?: EmailUserId;
  providerContactId?: EmailProviderContactId;
  email: EmailAddress;
  name?: string;
  status?: EmailSubscriberStatus;
  audienceIds?: EmailAudienceId[];
  segmentIds?: EmailSegmentId[];
  fields?: EmailCustomFields;
};

export type EmailContactReference = {
  publicationId?: EmailPublicationId;
  contactId?: EmailProviderContactId;
  subscriberId?: EmailSubscriberId;
  email?: EmailAddress;
};

export type UpdateEmailContactStatusInput = {
  contact: EmailContactReference;
  status: EmailSubscriberStatus;
};

export type EmailAudience = {
  id: EmailAudienceId;
  provider: EmailProviderKey;
  publicationId: EmailPublicationId;
  key: string;
  name: string;
  description?: string;
  status: EmailListStatus;
  providerAudienceId?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UpsertEmailAudienceInput = {
  id?: EmailAudienceId;
  publicationId: EmailPublicationId;
  key: string;
  name: string;
  description?: string;
  status?: EmailListStatus;
  providerAudienceId?: string;
};

export type EmailSegmentDefinition = {
  source: "manual" | "subscriber_status" | "entitlement" | "custom";
  rules?: Record<string, EmailCustomFieldValue | EmailCustomFieldValue[]>;
};

export type EmailSegment = {
  id: EmailSegmentId;
  provider: EmailProviderKey;
  publicationId: EmailPublicationId;
  audienceId?: EmailAudienceId;
  key: string;
  name: string;
  description?: string;
  status: EmailListStatus;
  definition?: EmailSegmentDefinition;
  providerSegmentId?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UpsertEmailSegmentInput = {
  id?: EmailSegmentId;
  publicationId: EmailPublicationId;
  audienceId?: EmailAudienceId;
  key: string;
  name: string;
  description?: string;
  status?: EmailListStatus;
  definition?: EmailSegmentDefinition;
  providerSegmentId?: string;
};

export type EmailAudienceMembership = {
  contact: EmailContactReference;
  audienceId: EmailAudienceId;
  status: "active" | "removed";
  updatedAt: Date;
};

export type EmailSegmentMembership = {
  contact: EmailContactReference;
  segmentId: EmailSegmentId;
  status: "active" | "removed";
  updatedAt: Date;
};

export type EmailAudienceMembershipInput = {
  contact: EmailContactReference;
  audienceId: EmailAudienceId;
};

export type EmailSegmentMembershipInput = {
  contact: EmailContactReference;
  segmentId: EmailSegmentId;
};

export type EmailMessageContent = {
  subject: string;
  html?: string;
  text?: string;
  previewText?: string;
};

export type EmailAttachment = {
  fileName: string;
  contentType?: string;
  content: string | Uint8Array;
};

export type EmailSendKind = "transactional" | "broadcast";

export type EmailSendIntentStatus =
  | "pending"
  | "reserved"
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "canceled"
  | "suppressed"
  | "skipped_duplicate";

export type EmailSendIntentReference = {
  id: EmailSendIntentId;
  dedupeKey: EmailDedupeKey;
};

export type EmailSendIntent = {
  id: EmailSendIntentId;
  publicationId: EmailPublicationId;
  kind: EmailSendKind;
  dedupeKey: EmailDedupeKey;
  status: EmailSendIntentStatus;
  provider?: EmailProviderKey;
  recipientEmail?: EmailAddress;
  subscriberId?: EmailSubscriberId;
  broadcastId?: EmailBroadcastId;
  providerMessageId?: EmailProviderMessageId;
  providerBroadcastId?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  reservedAt?: Date;
  sentAt?: Date;
};

export type CreateEmailSendIntentInput = {
  publicationId: EmailPublicationId;
  kind: EmailSendKind;
  dedupeKey: EmailDedupeKey;
  recipientEmail?: EmailAddress;
  subscriberId?: EmailSubscriberId;
  broadcastId?: EmailBroadcastId;
  metadata?: EmailMetadata;
};

export type EmailSendLogLevel = "info" | "warning" | "error";

export type EmailDeliveryLog = {
  id: string;
  publicationId?: EmailPublicationId;
  intentId?: EmailSendIntentId;
  broadcastId?: EmailBroadcastId;
  subscriberId?: EmailSubscriberId;
  recipientEmail?: EmailAddress;
  provider?: EmailProviderKey;
  providerMessageId?: EmailProviderMessageId;
  eventType: string;
  level: EmailSendLogLevel;
  message?: string;
  metadata?: EmailMetadata;
  createdAt: Date;
};

export type TransactionalEmailPurpose =
  | "magic_link"
  | "receipt"
  | "subscription_update"
  | "comment_notification"
  | "share_by_email"
  | "admin"
  | "custom";

export type SendTransactionalEmailInput = {
  publicationId: EmailPublicationId;
  purpose: TransactionalEmailPurpose;
  intent: EmailSendIntentReference;
  to: EmailAddressWithName | EmailAddressWithName[];
  from?: EmailAddressWithName;
  replyTo?: EmailAddressWithName;
  content: EmailMessageContent;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  tags?: string[];
  metadata?: EmailMetadata;
};

export type EmailBroadcastStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "canceled";

export type EmailBroadcastTarget = {
  audienceIds?: EmailAudienceId[];
  segmentIds?: EmailSegmentId[];
  subscriberIds?: EmailSubscriberId[];
  excludeSubscriberIds?: EmailSubscriberId[];
};

export type CreateEmailBroadcastInput = {
  publicationId: EmailPublicationId;
  key?: string;
  from?: EmailAddressWithName;
  replyTo?: EmailAddressWithName;
  content: EmailMessageContent;
  target: EmailBroadcastTarget;
  scheduledAt?: Date;
  metadata?: EmailMetadata;
};

export type EmailBroadcast = {
  id: EmailBroadcastId;
  provider: EmailProviderKey;
  publicationId: EmailPublicationId;
  key?: string;
  status: EmailBroadcastStatus;
  from?: EmailAddressWithName;
  replyTo?: EmailAddressWithName;
  content: EmailMessageContent;
  target: EmailBroadcastTarget;
  providerBroadcastId?: string;
  scheduledAt?: Date;
  sentAt?: Date;
  metadata?: EmailMetadata;
  createdAt: Date;
  updatedAt: Date;
};

export type EmailProviderEventType =
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.failed"
  | "email.bounced"
  | "email.complained"
  | "email.suppressed"
  | "email.opened"
  | "email.clicked"
  | "contact.updated"
  | (string & {});

export type EmailProviderEvent = {
  id: string;
  provider: EmailProviderKey;
  type: EmailProviderEventType;
  createdAt: Date;
  providerMessageId?: EmailProviderMessageId;
  recipientEmail?: EmailAddress;
  broadcastId?: EmailBroadcastId;
  subscriberId?: EmailSubscriberId;
  payload: Record<string, unknown>;
};

export type SendEmailBroadcastInput = {
  broadcastId: EmailBroadcastId;
  providerBroadcastId?: string;
  intent: EmailSendIntentReference;
  scheduledAt?: Date;
  metadata?: EmailMetadata;
};

export type EmailSendResult = {
  provider: EmailProviderKey;
  intentId: EmailSendIntentId;
  dedupeKey: EmailDedupeKey;
  status: EmailSendIntentStatus;
  accepted: boolean;
  providerMessageId?: EmailProviderMessageId;
  broadcastId?: EmailBroadcastId;
  providerBroadcastId?: string;
  sentAt?: Date;
  skippedReason?: string;
};

export interface EmailProvider {
  readonly key: EmailProviderKey;

  upsertContact(input: UpsertEmailContactInput): Promise<EmailContact>;
  updateContactStatus(input: UpdateEmailContactStatusInput): Promise<EmailContact>;

  upsertAudience(input: UpsertEmailAudienceInput): Promise<EmailAudience>;
  upsertSegment(input: UpsertEmailSegmentInput): Promise<EmailSegment>;
  addContactToAudience(input: EmailAudienceMembershipInput): Promise<EmailAudienceMembership>;
  removeContactFromAudience(input: EmailAudienceMembershipInput): Promise<EmailAudienceMembership>;
  addContactToSegment(input: EmailSegmentMembershipInput): Promise<EmailSegmentMembership>;
  removeContactFromSegment(input: EmailSegmentMembershipInput): Promise<EmailSegmentMembership>;

  sendTransactional(input: SendTransactionalEmailInput): Promise<EmailSendResult>;
  createBroadcast(input: CreateEmailBroadcastInput): Promise<EmailBroadcast>;
  sendBroadcast(input: SendEmailBroadcastInput): Promise<EmailSendResult>;
}
