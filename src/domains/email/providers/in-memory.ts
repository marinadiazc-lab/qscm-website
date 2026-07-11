import { EmailProviderError } from "../errors";
import type {
  CreateEmailBroadcastInput,
  EmailAudience,
  EmailAudienceMembership,
  EmailAudienceMembershipInput,
  EmailBroadcast,
  EmailBroadcastTarget,
  EmailContact,
  EmailContactReference,
  EmailCustomFields,
  EmailDedupeKey,
  EmailMetadata,
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

export type InMemoryEmailProviderOptions = {
  key?: EmailProviderKey;
  now?: () => Date;
};

export class InMemoryEmailProvider implements EmailProvider {
  readonly key: EmailProviderKey;

  private readonly now: () => Date;
  private nextId = 1;
  private readonly contacts = new Map<string, EmailContact>();
  private readonly contactsByEmail = new Map<string, string>();
  private readonly audiences = new Map<string, EmailAudience>();
  private readonly segments = new Map<string, EmailSegment>();
  private readonly audienceMemberships = new Map<string, EmailAudienceMembership>();
  private readonly segmentMemberships = new Map<string, EmailSegmentMembership>();
  private readonly broadcasts = new Map<string, EmailBroadcast>();
  private readonly completedDedupeKeys = new Set<EmailDedupeKey>();
  private readonly sentResults: EmailSendResult[] = [];

  constructor(options: InMemoryEmailProviderOptions = {}) {
    this.key = options.key ?? "in_memory";
    this.now = options.now ?? (() => new Date());
  }

  async upsertContact(input: UpsertEmailContactInput): Promise<EmailContact> {
    const now = this.now();
    const existing = this.findContact({
      publicationId: input.publicationId,
      contactId: input.providerContactId,
      subscriberId: input.subscriberId,
      email: input.email,
    });
    const id = input.providerContactId ?? existing?.id ?? this.generateId("contact");
    const contact: EmailContact = {
      id,
      provider: this.key,
      publicationId: input.publicationId,
      subscriberId: input.subscriberId ?? existing?.subscriberId,
      userId: input.userId ?? existing?.userId,
      email: input.email,
      name: input.name ?? existing?.name,
      status: input.status ?? existing?.status ?? "active",
      audienceIds: unique([...(existing?.audienceIds ?? []), ...(input.audienceIds ?? [])]),
      segmentIds: unique([...(existing?.segmentIds ?? []), ...(input.segmentIds ?? [])]),
      fields: {
        ...(existing?.fields ?? {}),
        ...(input.fields ?? {}),
      },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.contacts.set(contact.id, contact);
    this.contactsByEmail.set(contactEmailKey(contact.publicationId, contact.email), contact.id);

    return cloneContact(contact);
  }

  async updateContactStatus(input: UpdateEmailContactStatusInput): Promise<EmailContact> {
    const contact = this.requireContact(input.contact);
    const updated: EmailContact = {
      ...contact,
      status: input.status,
      updatedAt: this.now(),
    };

    this.contacts.set(updated.id, updated);

    return cloneContact(updated);
  }

  async upsertAudience(input: UpsertEmailAudienceInput): Promise<EmailAudience> {
    const now = this.now();
    const existing = input.id
      ? this.audiences.get(input.id)
      : this.findAudienceByKey(input.publicationId, input.key);
    const audience: EmailAudience = {
      id: input.id ?? existing?.id ?? this.generateId("audience"),
      provider: this.key,
      publicationId: input.publicationId,
      key: input.key,
      name: input.name,
      description: input.description ?? existing?.description,
      status: input.status ?? existing?.status ?? "active",
      providerAudienceId: input.providerAudienceId ?? existing?.providerAudienceId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.audiences.set(audience.id, audience);

    return cloneAudience(audience);
  }

  async upsertSegment(input: UpsertEmailSegmentInput): Promise<EmailSegment> {
    const now = this.now();
    const existing = input.id
      ? this.segments.get(input.id)
      : this.findSegmentByKey(input.publicationId, input.key);
    const segment: EmailSegment = {
      id: input.id ?? existing?.id ?? this.generateId("segment"),
      provider: this.key,
      publicationId: input.publicationId,
      audienceId: input.audienceId ?? existing?.audienceId,
      key: input.key,
      name: input.name,
      description: input.description ?? existing?.description,
      status: input.status ?? existing?.status ?? "active",
      definition: input.definition ?? existing?.definition,
      providerSegmentId: input.providerSegmentId ?? existing?.providerSegmentId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.segments.set(segment.id, segment);

    return cloneSegment(segment);
  }

  async addContactToAudience(
    input: EmailAudienceMembershipInput,
  ): Promise<EmailAudienceMembership> {
    const contact = this.requireContact(input.contact);
    this.requireAudience(input.audienceId);

    const updatedContact = {
      ...contact,
      audienceIds: unique([...contact.audienceIds, input.audienceId]),
      updatedAt: this.now(),
    };
    const membership = this.storeAudienceMembership(updatedContact, input.audienceId, "active");

    this.contacts.set(updatedContact.id, updatedContact);

    return cloneAudienceMembership(membership);
  }

  async removeContactFromAudience(
    input: EmailAudienceMembershipInput,
  ): Promise<EmailAudienceMembership> {
    const contact = this.requireContact(input.contact);
    this.requireAudience(input.audienceId);

    const updatedContact = {
      ...contact,
      audienceIds: contact.audienceIds.filter((audienceId) => audienceId !== input.audienceId),
      updatedAt: this.now(),
    };
    const membership = this.storeAudienceMembership(updatedContact, input.audienceId, "removed");

    this.contacts.set(updatedContact.id, updatedContact);

    return cloneAudienceMembership(membership);
  }

  async addContactToSegment(input: EmailSegmentMembershipInput): Promise<EmailSegmentMembership> {
    const contact = this.requireContact(input.contact);
    this.requireSegment(input.segmentId);

    const updatedContact = {
      ...contact,
      segmentIds: unique([...contact.segmentIds, input.segmentId]),
      updatedAt: this.now(),
    };
    const membership = this.storeSegmentMembership(updatedContact, input.segmentId, "active");

    this.contacts.set(updatedContact.id, updatedContact);

    return cloneSegmentMembership(membership);
  }

  async removeContactFromSegment(
    input: EmailSegmentMembershipInput,
  ): Promise<EmailSegmentMembership> {
    const contact = this.requireContact(input.contact);
    this.requireSegment(input.segmentId);

    const updatedContact = {
      ...contact,
      segmentIds: contact.segmentIds.filter((segmentId) => segmentId !== input.segmentId),
      updatedAt: this.now(),
    };
    const membership = this.storeSegmentMembership(updatedContact, input.segmentId, "removed");

    this.contacts.set(updatedContact.id, updatedContact);

    return cloneSegmentMembership(membership);
  }

  async sendTransactional(input: SendTransactionalEmailInput): Promise<EmailSendResult> {
    const duplicate = this.duplicateResult(input.intent.id, input.intent.dedupeKey);

    if (duplicate) {
      return duplicate;
    }

    const result: EmailSendResult = {
      provider: this.key,
      intentId: input.intent.id,
      dedupeKey: input.intent.dedupeKey,
      status: "sent",
      accepted: true,
      providerMessageId: this.generateId("message"),
      sentAt: this.now(),
    };

    return this.storeSendResult(result);
  }

  async createBroadcast(input: CreateEmailBroadcastInput): Promise<EmailBroadcast> {
    const now = this.now();
    const broadcast: EmailBroadcast = {
      id: this.generateId("broadcast"),
      provider: this.key,
      publicationId: input.publicationId,
      key: input.key,
      status: input.scheduledAt ? "scheduled" : "draft",
      from: input.from ? cloneAddress(input.from) : undefined,
      replyTo: input.replyTo ? cloneAddress(input.replyTo) : undefined,
      content: { ...input.content },
      target: cloneTarget(input.target),
      providerBroadcastId: this.generateId("provider_broadcast"),
      scheduledAt: cloneDate(input.scheduledAt),
      metadata: cloneMetadata(input.metadata),
      createdAt: now,
      updatedAt: now,
    };

    this.broadcasts.set(broadcast.id, broadcast);

    return cloneBroadcast(broadcast);
  }

  async sendBroadcast(input: SendEmailBroadcastInput): Promise<EmailSendResult> {
    const broadcast = this.broadcasts.get(input.providerBroadcastId ?? input.broadcastId)
      ?? Array.from(this.broadcasts.values()).find(
        (storedBroadcast) => storedBroadcast.providerBroadcastId === input.providerBroadcastId,
      );

    if (!broadcast) {
      throw new EmailProviderError(
        `InMemoryEmailProvider could not find broadcast ${input.providerBroadcastId ?? input.broadcastId}.`,
        this.key,
      );
    }

    const duplicate = this.duplicateResult(input.intent.id, input.intent.dedupeKey, broadcast.id);

    if (duplicate) {
      return duplicate;
    }

    const now = this.now();
    const updatedBroadcast: EmailBroadcast = {
      ...broadcast,
      status: "sent",
      scheduledAt: cloneDate(input.scheduledAt ?? broadcast.scheduledAt),
      sentAt: now,
      updatedAt: now,
      metadata: {
        ...(broadcast.metadata ?? {}),
        ...(input.metadata ?? {}),
      },
    };

    this.broadcasts.set(updatedBroadcast.id, updatedBroadcast);

    const result: EmailSendResult = {
      provider: this.key,
      intentId: input.intent.id,
      dedupeKey: input.intent.dedupeKey,
      status: "sent",
      accepted: true,
      broadcastId: updatedBroadcast.id,
      providerBroadcastId: updatedBroadcast.providerBroadcastId,
      sentAt: now,
    };

    return this.storeSendResult(result);
  }

  listContacts() {
    return Array.from(this.contacts.values()).map(cloneContact);
  }

  listAudiences() {
    return Array.from(this.audiences.values()).map(cloneAudience);
  }

  listSegments() {
    return Array.from(this.segments.values()).map(cloneSegment);
  }

  listBroadcasts() {
    return Array.from(this.broadcasts.values()).map(cloneBroadcast);
  }

  listSentResults() {
    return this.sentResults.map(cloneSendResult);
  }

  private findContact(reference: EmailContactReference) {
    if (reference.contactId) {
      return this.contacts.get(reference.contactId);
    }

    if (reference.email) {
      const contactId = reference.publicationId
        ? this.contactsByEmail.get(contactEmailKey(reference.publicationId, reference.email))
        : undefined;

      if (contactId) {
        return this.contacts.get(contactId);
      }

      return Array.from(this.contacts.values()).find(
        (contact) => normalizeEmail(contact.email) === normalizeEmail(reference.email ?? ""),
      );
    }

    if (reference.subscriberId) {
      return Array.from(this.contacts.values()).find(
        (contact) => contact.subscriberId === reference.subscriberId,
      );
    }

    return undefined;
  }

  private findAudienceByKey(publicationId: string, key: string) {
    return Array.from(this.audiences.values()).find(
      (audience) => audience.publicationId === publicationId && audience.key === key,
    );
  }

  private findSegmentByKey(publicationId: string, key: string) {
    return Array.from(this.segments.values()).find(
      (segment) => segment.publicationId === publicationId && segment.key === key,
    );
  }

  private requireContact(reference: EmailContactReference) {
    const contact = this.findContact(reference);

    if (!contact) {
      throw new EmailProviderError(
        "InMemoryEmailProvider could not find a contact for the supplied reference.",
        this.key,
      );
    }

    return contact;
  }

  private requireAudience(audienceId: string) {
    const audience = this.audiences.get(audienceId);

    if (!audience) {
      throw new EmailProviderError(
        `InMemoryEmailProvider could not find audience ${audienceId}.`,
        this.key,
      );
    }

    return audience;
  }

  private requireSegment(segmentId: string) {
    const segment = this.segments.get(segmentId);

    if (!segment) {
      throw new EmailProviderError(
        `InMemoryEmailProvider could not find segment ${segmentId}.`,
        this.key,
      );
    }

    return segment;
  }

  private storeAudienceMembership(
    contact: EmailContact,
    audienceId: string,
    status: EmailAudienceMembership["status"],
  ) {
    const membership: EmailAudienceMembership = {
      contact: toContactReference(contact),
      audienceId,
      status,
      updatedAt: contact.updatedAt,
    };

    this.audienceMemberships.set(`${contact.id}:${audienceId}`, membership);

    return membership;
  }

  private storeSegmentMembership(
    contact: EmailContact,
    segmentId: string,
    status: EmailSegmentMembership["status"],
  ) {
    const membership: EmailSegmentMembership = {
      contact: toContactReference(contact),
      segmentId,
      status,
      updatedAt: contact.updatedAt,
    };

    this.segmentMemberships.set(`${contact.id}:${segmentId}`, membership);

    return membership;
  }

  private duplicateResult(
    intentId: string,
    dedupeKey: EmailDedupeKey,
    broadcastId?: string,
  ): EmailSendResult | undefined {
    if (!this.completedDedupeKeys.has(dedupeKey)) {
      return undefined;
    }

    return this.storeSendResult({
      provider: this.key,
      intentId,
      dedupeKey,
      status: "skipped_duplicate",
      accepted: false,
      broadcastId,
      skippedReason: "A send with this dedupe key was already accepted by this provider.",
    });
  }

  private storeSendResult(result: EmailSendResult) {
    if (result.accepted) {
      this.completedDedupeKeys.add(result.dedupeKey);
    }

    const stored = cloneSendResult(result);
    this.sentResults.push(stored);

    return cloneSendResult(stored);
  }

  private generateId(prefix: string) {
    const id = `${prefix}_${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function toContactReference(contact: EmailContact): EmailContactReference {
  return {
    publicationId: contact.publicationId,
    contactId: contact.id,
    subscriberId: contact.subscriberId,
    email: contact.email,
  };
}

function contactEmailKey(publicationId: string, email: string) {
  return `${publicationId}:${normalizeEmail(email)}`;
}

function cloneContact(contact: EmailContact): EmailContact {
  return {
    ...contact,
    audienceIds: [...contact.audienceIds],
    segmentIds: [...contact.segmentIds],
    fields: cloneFields(contact.fields),
    createdAt: cloneDate(contact.createdAt),
    updatedAt: cloneDate(contact.updatedAt),
  };
}

function cloneAudience(audience: EmailAudience): EmailAudience {
  return {
    ...audience,
    createdAt: cloneDate(audience.createdAt),
    updatedAt: cloneDate(audience.updatedAt),
  };
}

function cloneSegment(segment: EmailSegment): EmailSegment {
  return {
    ...segment,
    definition: segment.definition
      ? {
          source: segment.definition.source,
          rules: segment.definition.rules ? { ...segment.definition.rules } : undefined,
        }
      : undefined,
    createdAt: cloneDate(segment.createdAt),
    updatedAt: cloneDate(segment.updatedAt),
  };
}

function cloneAudienceMembership(membership: EmailAudienceMembership): EmailAudienceMembership {
  return {
    contact: { ...membership.contact },
    audienceId: membership.audienceId,
    status: membership.status,
    updatedAt: cloneDate(membership.updatedAt),
  };
}

function cloneSegmentMembership(membership: EmailSegmentMembership): EmailSegmentMembership {
  return {
    contact: { ...membership.contact },
    segmentId: membership.segmentId,
    status: membership.status,
    updatedAt: cloneDate(membership.updatedAt),
  };
}

function cloneBroadcast(broadcast: EmailBroadcast): EmailBroadcast {
  return {
    ...broadcast,
    from: broadcast.from ? cloneAddress(broadcast.from) : undefined,
    replyTo: broadcast.replyTo ? cloneAddress(broadcast.replyTo) : undefined,
    content: { ...broadcast.content },
    target: cloneTarget(broadcast.target),
    scheduledAt: cloneDate(broadcast.scheduledAt),
    sentAt: cloneDate(broadcast.sentAt),
    metadata: cloneMetadata(broadcast.metadata),
    createdAt: cloneDate(broadcast.createdAt),
    updatedAt: cloneDate(broadcast.updatedAt),
  };
}

function cloneAddress(address: { email: string; name?: string }) {
  return {
    email: address.email,
    name: address.name,
  };
}

function cloneTarget(target: EmailBroadcastTarget): EmailBroadcastTarget {
  return {
    audienceIds: target.audienceIds ? [...target.audienceIds] : undefined,
    segmentIds: target.segmentIds ? [...target.segmentIds] : undefined,
    subscriberIds: target.subscriberIds ? [...target.subscriberIds] : undefined,
    excludeSubscriberIds: target.excludeSubscriberIds ? [...target.excludeSubscriberIds] : undefined,
  };
}

function cloneFields(fields: EmailCustomFields): EmailCustomFields {
  return { ...fields };
}

function cloneMetadata(metadata: EmailMetadata | undefined): EmailMetadata | undefined {
  return metadata ? { ...metadata } : undefined;
}

function cloneSendResult(result: EmailSendResult): EmailSendResult {
  return {
    ...result,
    sentAt: cloneDate(result.sentAt),
  };
}

function cloneDate<DateLike extends Date | undefined>(date: DateLike): DateLike {
  return (date ? new Date(date) : undefined) as DateLike;
}
