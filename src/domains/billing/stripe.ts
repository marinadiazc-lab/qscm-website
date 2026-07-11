import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  BillingMetadata,
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

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export class StripeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigurationError";
  }
}

export class StripeApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StripeApiError";
    this.status = status;
  }
}

export class StripeRestClient {
  constructor(
    private readonly secretKey = process.env.STRIPE_SECRET_KEY,
    private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
    private readonly apiVersion = process.env.STRIPE_API_VERSION,
  ) {}

  async createCustomer(input: StripeCustomerCreateInput): Promise<StripeCustomerCreateResult> {
    const response = await this.request<StripeCustomerResponse>("/customers", {
      email: input.email,
      metadata: metadataParams(input.metadata),
    });

    return {
      customerId: response.id,
    };
  }

  async createCheckoutSession(
    input: CheckoutSessionCreateInput,
  ): Promise<CheckoutSessionCreateResult> {
    const response = await this.request<StripeCheckoutSessionResponse>(
      "/checkout/sessions",
      {
        mode: "subscription",
        customer: input.existingStripeCustomerId,
        customer_email: input.existingStripeCustomerId ? undefined : input.customerEmail,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        "line_items[0][price]": input.stripePriceId,
        "line_items[0][quantity]": "1",
        allow_promotion_codes: "true",
        billing_address_collection: "required",
        automatic_tax: { enabled: "true" },
        client_reference_id: input.userId ?? input.subscriberId,
        metadata: metadataParams(input.metadata),
        subscription_data: {
          metadata: metadataParams({
            ...(input.metadata ?? {}),
            publicationId: input.publicationId,
            tierId: input.tierId,
            tierPriceId: input.tierPriceId,
          }),
        },
      },
      input.idempotencyKey,
    );

    if (!response.url) {
      throw new StripeApiError("Stripe did not return a checkout URL.", 502);
    }

    return {
      provider: "stripe",
      sessionId: response.id,
      url: response.url,
    };
  }

  async createCustomerPortalSession(
    input: CustomerPortalCreateInput,
  ): Promise<CustomerPortalCreateResult> {
    const response = await this.request<StripePortalSessionResponse>(
      "/billing_portal/sessions",
      {
        customer: input.stripeCustomerId,
        return_url: input.returnUrl,
      },
      input.idempotencyKey,
    );

    return {
      provider: "stripe",
      sessionId: response.id,
      url: response.url,
    };
  }

  constructWebhookEvent(input: WebhookProcessInput): StripeWebhookEvent {
    if (!this.webhookSecret) {
      throw new StripeConfigurationError("STRIPE_WEBHOOK_SECRET is required for billing webhooks.");
    }

    const rawBody =
      typeof input.rawBody === "string"
        ? input.rawBody
        : Buffer.from(input.rawBody).toString("utf8");
    const signatureHeader = headerValue(input.headers["stripe-signature"]);

    if (!signatureHeader) {
      throw new StripeApiError("Missing Stripe signature header.", 400);
    }

    verifyStripeSignature(rawBody, signatureHeader, this.webhookSecret);
    return JSON.parse(rawBody) as StripeWebhookEvent;
  }

  async retrieveSubscription(subscriptionId: string): Promise<StripeSubscriptionRecord> {
    const response = await this.request<StripeSubscriptionResponse>(
      `/subscriptions/${subscriptionId}`,
      {
        expand: ["items.data.price"],
      },
      undefined,
      "GET",
    );

    return toSubscriptionRecord(response);
  }

  async listSubscriptionsForCustomer(customerId: string): Promise<StripeSubscriptionRecord[]> {
    const response = await this.request<StripeSubscriptionListResponse>(
      "/subscriptions",
      {
        customer: customerId,
        status: "all",
        limit: "25",
        expand: ["data.items.data.price"],
      },
      undefined,
      "GET",
    );

    return response.data.map(toSubscriptionRecord);
  }

  async processWebhookEvent(_input: WebhookProcessInput): Promise<WebhookProcessResult> {
    throw new Error("Use BillingService.processWebhookEvent so local state is updated transactionally.");
  }

  private async request<T>(
    path: string,
    body: StripeParams,
    idempotencyKey?: string,
    method: "GET" | "POST" = "POST",
  ): Promise<T> {
    if (!this.secretKey) {
      throw new StripeConfigurationError("STRIPE_SECRET_KEY is required for Stripe billing.");
    }

    const url = new URL(`${STRIPE_API_BASE}${path}`);
    const encodedBody = encodeParams(body);
    const response = await fetch(method === "GET" ? withQuery(url, encodedBody) : url, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        ...(this.apiVersion ? { "Stripe-Version": this.apiVersion } : {}),
        ...(method === "POST"
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: method === "POST" ? encodedBody : undefined,
    });

    const payload = (await response.json().catch(() => ({}))) as StripeErrorResponse | T;

    if (!response.ok) {
      throw new StripeApiError(
        "error" in payload
          ? payload.error.message
          : `Stripe API request failed with status ${response.status}.`,
        response.status,
      );
    }

    return payload as T;
  }
}

type StripeParams =
  | Record<string, StripeParamValue | StripeParams | StripeParamValue[] | StripeParams[] | undefined>
  | undefined;

type StripeParamValue = string | number | boolean | null;

type StripeErrorResponse = {
  error: {
    message: string;
  };
};

type StripeCustomerResponse = {
  id: string;
};

type StripeCheckoutSessionResponse = {
  id: string;
  url?: string;
};

type StripePortalSessionResponse = {
  id: string;
  url: string;
};

export type StripeWebhookEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

type StripeSubscriptionListResponse = {
  data: StripeSubscriptionResponse[];
};

type StripeSubscriptionResponse = {
  id: string;
  customer: string;
  status: string;
  current_period_start?: number;
  current_period_end?: number;
  trial_end?: number | null;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  metadata?: Record<string, string>;
  items?: {
    data: Array<{
      price?: {
        id: string;
        product?: string | { id: string };
      };
    }>;
  };
};

function verifyStripeSignature(rawBody: string, signatureHeader: string, webhookSecret: string) {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=", 2);
      return [key, value];
    }),
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;

  if (!timestamp || !signature) {
    throw new StripeApiError("Invalid Stripe signature header.", 400);
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);

  if (ageSeconds > WEBHOOK_TOLERANCE_SECONDS) {
    throw new StripeApiError("Stripe webhook signature timestamp is outside tolerance.", 400);
  }

  const expected = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(signature, "hex");

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new StripeApiError("Invalid Stripe webhook signature.", 400);
  }
}

function toSubscriptionRecord(response: StripeSubscriptionResponse): StripeSubscriptionRecord {
  const price = response.items?.data[0]?.price;

  return {
    customerId: response.customer,
    subscriptionId: response.id,
    status: response.status,
    priceId: price?.id,
    productId: typeof price?.product === "string" ? price.product : price?.product?.id,
    currentPeriodStart: fromUnix(response.current_period_start),
    currentPeriodEnd: fromUnix(response.current_period_end),
    trialEnd: fromUnix(response.trial_end),
    cancelAtPeriodEnd: response.cancel_at_period_end ?? false,
    canceledAt: fromUnix(response.canceled_at),
    metadata: response.metadata ?? {},
  };
}

function metadataParams(metadata: BillingMetadata | undefined) {
  return Object.fromEntries(
    Object.entries(metadata ?? {}).map(([key, value]) => [key, value == null ? "" : String(value)]),
  );
}

function encodeParams(params: StripeParams, prefix?: string): URLSearchParams {
  const encoded = new URLSearchParams();

  appendParams(encoded, params, prefix);
  return encoded;
}

function appendParams(encoded: URLSearchParams, params: StripeParams, prefix?: string) {
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) {
      continue;
    }

    const nextKey = prefix ? `${prefix}[${key}]` : key;

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "object" && item !== null) {
          appendParams(encoded, item as StripeParams, `${nextKey}[${index}]`);
        } else {
          encoded.append(`${nextKey}[]`, String(item ?? ""));
        }
      });
      continue;
    }

    if (typeof value === "object" && value !== null) {
      appendParams(encoded, value as StripeParams, nextKey);
      continue;
    }

    encoded.append(nextKey, String(value ?? ""));
  }
}

function withQuery(url: URL, query: URLSearchParams) {
  const target = new URL(url);

  query.forEach((value, key) => target.searchParams.append(key, value));
  return target;
}

function fromUnix(value: number | null | undefined) {
  return value ? new Date(value * 1000) : undefined;
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
