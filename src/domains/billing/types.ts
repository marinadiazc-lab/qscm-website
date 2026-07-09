import type {
  BillingInterval,
  EntitlementDecision,
  SubscriptionStatus,
  TierId,
  TierPriceId,
} from "../subscriptions";

export type BillingProviderName = "stripe";

export type StripeId = string;

export interface StripeMappingIds {
  customerId?: StripeId;
  productId?: StripeId;
  priceId?: StripeId;
  subscriptionId?: StripeId;
  checkoutSessionId?: StripeId;
}

export interface StripeTierMappingIds {
  productId: StripeId;
  pricesByInterval: Partial<Record<BillingInterval, StripeId>>;
}

export interface StripeSubscriptionMappingIds {
  customerId: StripeId;
  subscriptionId: StripeId;
  productId?: StripeId;
  priceId?: StripeId;
}

export type BillingMetadataValue = string | number | boolean | null;

export type BillingMetadata = Record<string, BillingMetadataValue>;

export interface CheckoutSessionCreateInput {
  publicationId: string;
  tierId: TierId;
  tierPriceId: TierPriceId;
  interval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  userId?: string;
  subscriberId?: string;
  customerEmail?: string;
  existingStripeCustomerId?: StripeId;
  metadata?: BillingMetadata;
}

export interface CheckoutSessionCreateResult {
  provider: BillingProviderName;
  sessionId: StripeId;
  url: string;
}

export interface CustomerPortalCreateInput {
  stripeCustomerId: StripeId;
  returnUrl: string;
  idempotencyKey?: string;
  userId?: string;
  subscriberId?: string;
}

export interface CustomerPortalCreateResult {
  provider: BillingProviderName;
  sessionId: StripeId;
  url: string;
}

export type WebhookEventLogState =
  | "received"
  | "processing"
  | "processed"
  | "ignored"
  | "failed";

export interface WebhookEventLogEntry {
  id: string;
  provider: BillingProviderName;
  providerEventId: string;
  eventType: string;
  state: WebhookEventLogState;
  receivedAt: Date;
  processedAt?: Date;
  attemptCount: number;
  lastError?: string;
}

export interface WebhookProcessInput {
  provider: BillingProviderName;
  rawBody: string | Uint8Array;
  headers: Record<string, string | string[] | undefined>;
  receivedAt?: Date;
}

export interface WebhookProcessResult {
  provider: BillingProviderName;
  providerEventId: string;
  eventType: string;
  logState: WebhookEventLogState;
  subscriptionStatus?: SubscriptionStatus;
  entitlementDecision?: EntitlementDecision;
}
