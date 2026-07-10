export type SubscriberId = string;
export type SubscriberPublicationId = string;
export type SubscriberUserId = string;
export type SubscriberEmail = string;

export type SubscriberStatus =
  | "active"
  | "unsubscribed"
  | "bounced"
  | "complained"
  | "suppressed";

export type SubscriberSyncStatus = "pending" | "synced" | "failed" | "disabled";
export type SubscriberSyncProvider = "resend" | (string & {});

export type SubscriberMetadata = Record<string, unknown>;

export interface SubscriberRecord {
  id: SubscriberId;
  publicationId: SubscriberPublicationId;
  userId?: SubscriberUserId;
  email: SubscriberEmail;
  status: SubscriberStatus;
  source?: string;
  subscribedAt: Date;
  unsubscribedAt?: Date;
  bouncedAt?: Date;
  complainedAt?: Date;
  suppressedAt?: Date;
  metadata: SubscriberMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriberPreferences {
  subscriberId: SubscriberId;
  marketingEmailOptIn: boolean;
  productEmailOptIn: boolean;
  commentNotificationOptIn: boolean;
  metadata: SubscriberMetadata;
  updatedAt: Date;
}

export interface SubscriberProviderSync {
  id: string;
  subscriberId: SubscriberId;
  provider: SubscriberSyncProvider;
  providerContactId?: string;
  syncStatus: SubscriberSyncStatus;
  lastSyncedAt?: Date;
  lastError?: string;
  metadata: SubscriberMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export type SubscriberSyncReason =
  | "signup"
  | "preference_update"
  | "status_update"
  | "account_link"
  | "import";

export interface SubscriberSyncRequest {
  subscriberId: SubscriberId;
  provider: SubscriberSyncProvider;
  reason: SubscriberSyncReason;
  metadata?: SubscriberMetadata;
}

export interface SubscriberSignupInput {
  publicationId: SubscriberPublicationId;
  email: string;
  source?: string;
  userId?: SubscriberUserId;
  name?: string;
  now?: Date;
}

export interface SubscriberSignupResult {
  subscriber: SubscriberRecord;
  preferences: SubscriberPreferences;
  created: boolean;
  syncQueued: boolean;
}

export interface SubscriberPreferenceUpdateInput {
  subscriberId: SubscriberId;
  marketingEmailOptIn?: boolean;
  productEmailOptIn?: boolean;
  commentNotificationOptIn?: boolean;
  unsubscribe?: boolean;
  now?: Date;
}

export interface SubscriberStatusUpdateInput {
  subscriberId: SubscriberId;
  status: SubscriberStatus;
  reason?: string;
  provider?: SubscriberSyncProvider;
  occurredAt?: Date;
}

export interface LinkSubscriberToUserInput {
  publicationId: SubscriberPublicationId;
  email: string;
  userId: SubscriberUserId;
  emailVerified: boolean;
  now?: Date;
}

export interface SubscriberSearchInput {
  publicationId: SubscriberPublicationId;
  query?: string;
  status?: SubscriberStatus;
  limit?: number;
}

export interface SubscriberSearchResult {
  subscriber: SubscriberRecord;
  preferences?: SubscriberPreferences;
  syncs: SubscriberProviderSync[];
}

export interface SubscriberImportRow {
  email: string;
  status?: SubscriberStatus;
  source?: string;
  name?: string;
  marketingEmailOptIn?: boolean;
  productEmailOptIn?: boolean;
  commentNotificationOptIn?: boolean;
}

export interface SubscriberImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: SubscriberImportError[];
}

export interface SubscriberImportError {
  row: number;
  code: string;
  message: string;
}

export interface SubscriberExportRow {
  id: string;
  email: string;
  name: string;
  status: SubscriberStatus;
  source: string;
  userId: string;
  marketingEmailOptIn: string;
  productEmailOptIn: string;
  commentNotificationOptIn: string;
  syncStatus: string;
  syncProvider: string;
  createdAt: string;
  updatedAt: string;
}
