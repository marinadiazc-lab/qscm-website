import type {
  CheckoutSessionCreateInput,
  CheckoutSessionCreateResult,
  CustomerPortalCreateInput,
  CustomerPortalCreateResult,
  WebhookProcessInput,
  WebhookProcessResult,
} from "./types";

export interface BillingProvider {
  createCheckoutSession(input: CheckoutSessionCreateInput): Promise<CheckoutSessionCreateResult>;
  createCustomerPortalSession(input: CustomerPortalCreateInput): Promise<CustomerPortalCreateResult>;
  processWebhookEvent(input: WebhookProcessInput): Promise<WebhookProcessResult>;
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
