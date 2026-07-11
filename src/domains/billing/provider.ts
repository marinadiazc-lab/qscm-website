import type {
  CheckoutSessionCreateInput,
  CheckoutSessionCreateResult,
  CustomerPortalCreateInput,
  CustomerPortalCreateResult,
  StripeCustomerCreateInput,
  StripeCustomerCreateResult,
  StripeSubscriptionRecord,
  WebhookProcessInput,
  WebhookProcessResult,
} from "./types";

export interface BillingProvider {
  createCustomer(input: StripeCustomerCreateInput): Promise<StripeCustomerCreateResult>;
  createCheckoutSession(input: CheckoutSessionCreateInput): Promise<CheckoutSessionCreateResult>;
  createCustomerPortalSession(input: CustomerPortalCreateInput): Promise<CustomerPortalCreateResult>;
  processWebhookEvent(input: WebhookProcessInput): Promise<WebhookProcessResult>;
  retrieveSubscription?(subscriptionId: string): Promise<StripeSubscriptionRecord>;
  listSubscriptionsForCustomer?(customerId: string): Promise<StripeSubscriptionRecord[]>;
}

export class BillingProviderNotConfiguredError extends Error {
  readonly code = "BILLING_PROVIDER_NOT_CONFIGURED";

  constructor(operation: string) {
    super(`Stripe billing provider is not configured for ${operation}.`);
    this.name = "BillingProviderNotConfiguredError";
  }
}

export function createNotConfiguredStripeProvider(): BillingProvider {
  return {
    async createCustomer() {
      throw new BillingProviderNotConfiguredError("customer creation");
    },
    async createCheckoutSession() {
      throw new BillingProviderNotConfiguredError("checkout session creation");
    },
    async createCustomerPortalSession() {
      throw new BillingProviderNotConfiguredError("customer portal session creation");
    },
    async processWebhookEvent() {
      throw new BillingProviderNotConfiguredError("webhook processing");
    },
  };
}

export const stripeBillingProvider = createNotConfiguredStripeProvider();
