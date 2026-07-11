import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db, schema, type DbClient } from "@/src/db";
import type { BillingInterval, SubscriptionStatus } from "../subscriptions";
import type {
  CheckoutSessionCreateResult,
  CustomerPortalCreateResult,
  StripeSubscriptionPersistenceOptions,
  StripeSubscriptionRecord,
  WebhookProcessInput,
  WebhookProcessResult,
} from "./types";
import { StripeRestClient, type StripeWebhookEvent } from "./stripe";

type BillingDatabase = Pick<DbClient, "select" | "insert" | "update" | "delete">;
type ClaimedWebhookLog =
  | { state: "claimed"; logState: "processing" }
  | { state: "processed" | "ignored"; logState: "processed" | "ignored" }
  | { state: "processing_duplicate"; logState: "received" | "processing" | "failed" };

const STRIPE_SUBSCRIPTION_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
]);

const ENTITLED_STATUSES = new Set<SubscriptionStatus>([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
]);

export class BillingService {
  constructor(
    private readonly client = new StripeRestClient(),
    private readonly database: DbClient = db,
  ) {}

  async listCheckoutTiers(publicationId: string): Promise<CheckoutTier[]> {
    const tiers = await this.database
      .select()
      .from(schema.subscriptionTiers)
      .where(
        and(
          eq(schema.subscriptionTiers.publicationId, publicationId),
          eq(schema.subscriptionTiers.status, "active"),
        ),
      )
      .orderBy(schema.subscriptionTiers.sortOrder, schema.subscriptionTiers.name);

    return Promise.all(
      tiers.map(async (tier) => {
        const prices = await this.database
          .select()
          .from(schema.tierPrices)
          .where(
            and(
              eq(schema.tierPrices.tierId, tier.id),
              eq(schema.tierPrices.activeForCheckout, true),
              sql`${schema.tierPrices.providerPriceId} is not null`,
            ),
          )
          .orderBy(schema.tierPrices.interval);

        return {
          id: tier.id,
          slug: tier.slug,
          name: tier.name,
          description: tier.description ?? "",
          entitlementKeys: tier.entitlementKeys,
          prices: prices.map((price) => ({
            id: price.id,
            interval: price.interval,
            amountCents: price.amountCents,
            currency: price.currency,
            providerPriceId: price.providerPriceId,
          })),
        };
      }),
    );
  }

  async createCheckoutSession(input: {
    publicationId: string;
    tierPriceId: string;
    userId: string;
    email: string;
    baseUrl: string;
  }): Promise<CheckoutSessionCreateResult> {
    const { tier, price } = await this.requireCheckoutPrice(input.publicationId, input.tierPriceId);

    if (!price.providerPriceId) {
      throw new Error("This price is not mapped to a Stripe price id.");
    }

    const subscriber = await this.findOrCreateSubscriber(input);
    const customer = await this.findOrCreateBillingCustomer({
      publicationId: input.publicationId,
      subscriberId: subscriber.id,
      userId: input.userId,
      email: input.email,
    });
    const existingAccess = await this.findCheckoutBlockingSubscription({
      publicationId: input.publicationId,
      userId: input.userId,
      providerCustomerId: customer.providerCustomerId,
    });

    if (existingAccess) {
      throw new Error("This account already has paid subscription access.");
    }

    return this.client.createCheckoutSession({
      publicationId: input.publicationId,
      tierId: tier.id,
      tierPriceId: price.id,
      interval: price.interval as BillingInterval,
      stripePriceId: price.providerPriceId,
      successUrl: `${input.baseUrl}/account?billing=checkout_success`,
      cancelUrl: `${input.baseUrl}/subscribe?billing=checkout_canceled`,
      idempotencyKey: checkoutIdempotencyKey(input),
      userId: input.userId,
      subscriberId: subscriber.id,
      customerEmail: input.email,
      existingStripeCustomerId: customer.providerCustomerId,
      metadata: {
        publicationId: input.publicationId,
        userId: input.userId,
        subscriberId: subscriber.id,
        tierId: tier.id,
        tierPriceId: price.id,
      },
    });
  }

  async createPortalSession(input: {
    publicationId: string;
    userId: string;
    returnUrl: string;
  }): Promise<CustomerPortalCreateResult> {
    const [customer] = await this.database
      .select()
      .from(schema.billingCustomers)
      .where(
        and(
          eq(schema.billingCustomers.publicationId, input.publicationId),
          eq(schema.billingCustomers.userId, input.userId),
          eq(schema.billingCustomers.provider, "stripe"),
        ),
      )
      .limit(1);

    if (!customer) {
      throw new Error("No Stripe customer is linked to this account yet.");
    }

    return this.client.createCustomerPortalSession({
      stripeCustomerId: customer.providerCustomerId,
      returnUrl: input.returnUrl,
      idempotencyKey: `portal:${input.userId}:${Date.now()}`,
      userId: input.userId,
    });
  }

  async getAccountBillingStatus(input: {
    publicationId: string;
    userId: string;
  }): Promise<AccountBillingStatus> {
    const [row] = await this.database
      .select({
        subscription: schema.subscriptions,
        tier: schema.subscriptionTiers,
        price: schema.tierPrices,
        customer: schema.billingCustomers,
      })
      .from(schema.subscriptions)
      .leftJoin(schema.subscriptionTiers, eq(schema.subscriptions.tierId, schema.subscriptionTiers.id))
      .leftJoin(schema.tierPrices, eq(schema.subscriptions.tierPriceId, schema.tierPrices.id))
      .leftJoin(
        schema.billingCustomers,
        and(
          eq(schema.billingCustomers.provider, "stripe"),
          eq(schema.billingCustomers.providerCustomerId, schema.subscriptions.providerCustomerId),
        ),
      )
      .where(
        and(
          eq(schema.subscriptions.publicationId, input.publicationId),
          eq(schema.subscriptions.userId, input.userId),
        ),
      )
      .orderBy(desc(schema.subscriptions.updatedAt))
      .limit(1);

    if (!row) {
      return {
        status: "none",
        label: "No paid subscription",
        canOpenPortal: false,
      };
    }

    return {
      status: row.subscription.status,
      label: statusLabel(row.subscription.status),
      tierName: row.tier?.name,
      interval: row.price?.interval,
      currentPeriodEnd:
        row.subscription.currentPeriodEndsAt ?? row.subscription.accessEndsAt ?? undefined,
      cancelAtPeriodEnd: row.subscription.cancelAtPeriodEnd,
      providerCustomerId: row.subscription.providerCustomerId ?? row.customer?.providerCustomerId,
      providerSubscriptionId: row.subscription.providerSubscriptionId ?? undefined,
      canOpenPortal: Boolean(row.subscription.providerCustomerId ?? row.customer?.providerCustomerId),
    };
  }

  async processWebhookEvent(input: WebhookProcessInput): Promise<WebhookProcessResult> {
    const event = this.client.constructWebhookEvent(input);
    const payload = JSON.parse(
      typeof input.rawBody === "string" ? input.rawBody : Buffer.from(input.rawBody).toString("utf8"),
    ) as Record<string, unknown>;

    const claimed = await this.claimWebhookLog(event, payload);

    if (
      claimed.state === "processed" ||
      claimed.state === "ignored" ||
      claimed.state === "processing_duplicate"
    ) {
      return {
        provider: "stripe",
        providerEventId: event.id,
        eventType: event.type,
        logState: claimed.logState,
      };
    }

    try {
      const subscription = await this.subscriptionFromWebhookEvent(event);

      if (!subscription || !STRIPE_SUBSCRIPTION_EVENTS.has(event.type)) {
        await this.markWebhookLog(event.id, "ignored");
        return {
          provider: "stripe",
          providerEventId: event.id,
          eventType: event.type,
          logState: "ignored",
        };
      }

      const status = await this.persistStripeSubscription(subscription, {
        eventCreatedAt: fromUnixNumber(event.created),
      });

      await this.markWebhookLog(event.id, "processed");
      return {
        provider: "stripe",
        providerEventId: event.id,
        eventType: event.type,
        logState: "processed",
        subscriptionStatus: status,
      };
    } catch (error) {
      await this.markWebhookLog(
        event.id,
        "failed",
        error instanceof Error ? error.message : "Webhook processing failed.",
      );
      throw error;
    }
  }

  async reconcileStripeSubscriptions(input: {
    publicationId: string;
    limit?: number;
  }): Promise<ReconciliationResult> {
    const customers = await this.database
      .select()
      .from(schema.billingCustomers)
      .where(
        and(
          eq(schema.billingCustomers.publicationId, input.publicationId),
          eq(schema.billingCustomers.provider, "stripe"),
        ),
      )
      .limit(input.limit ?? 100);

    let checked = 0;
    let updated = 0;
    const reconciliationHighWaterMark = stripeEventSecondPrecision(new Date());
    const discrepancies: string[] = [];

    for (const customer of customers) {
      checked += 1;
      const subscriptions = await this.client.listSubscriptionsForCustomer(customer.providerCustomerId);

      for (const subscription of subscriptions) {
        const before = await this.findLocalSubscription(subscription.subscriptionId);
        const status = await this.persistStripeSubscription(subscription, {
          eventCreatedAt: reconciliationHighWaterMark,
        });
        updated += 1;

        if (before && before.status !== status) {
          discrepancies.push(
            `${subscription.subscriptionId}: local ${before.status}, stripe ${status}`,
          );
        }
      }
    }

    return {
      checkedCustomers: checked,
      updatedSubscriptions: updated,
      discrepancies,
    };
  }

  private async requireCheckoutPrice(publicationId: string, tierPriceId: string) {
    const [row] = await this.database
      .select({
        tier: schema.subscriptionTiers,
        price: schema.tierPrices,
      })
      .from(schema.tierPrices)
      .innerJoin(schema.subscriptionTiers, eq(schema.tierPrices.tierId, schema.subscriptionTiers.id))
      .where(
        and(
          eq(schema.subscriptionTiers.publicationId, publicationId),
          eq(schema.subscriptionTiers.status, "active"),
          eq(schema.tierPrices.id, tierPriceId),
          eq(schema.tierPrices.activeForCheckout, true),
          sql`${schema.tierPrices.providerPriceId} is not null`,
        ),
      )
      .limit(1);

    if (!row) {
      throw new Error("That checkout price is not available.");
    }

    return row;
  }

  private async findOrCreateSubscriber(input: {
    publicationId: string;
    userId: string;
    email: string;
  }) {
    const [existing] = await this.database
      .select()
      .from(schema.subscribers)
      .where(
        and(
          eq(schema.subscribers.publicationId, input.publicationId),
          sql`lower(${schema.subscribers.email}) = ${input.email.toLowerCase()}`,
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.database
        .update(schema.subscribers)
        .set({ userId: input.userId, updatedAt: new Date() })
        .where(eq(schema.subscribers.id, existing.id))
        .returning();

      return updated;
    }

    const [created] = await this.database
      .insert(schema.subscribers)
      .values({
        publicationId: input.publicationId,
        userId: input.userId,
        email: input.email,
        status: "active",
        source: "stripe_checkout",
      })
      .returning();

    return created;
  }

  private async findOrCreateBillingCustomer(input: {
    publicationId: string;
    subscriberId: string;
    userId: string;
    email: string;
  }) {
    return this.database.transaction(async (tx) => {
      await this.lockBillingCustomerKeys(tx, input);

      const existing = await this.findBillingCustomerForCheckout(input, tx);

      if (existing) {
        return existing;
      }

      const customer = await this.client.createCustomer({
        email: input.email,
        idempotencyKey: customerIdempotencyKey(input),
        metadata: {
          publicationId: input.publicationId,
          subscriberId: input.subscriberId,
          userId: input.userId,
        },
      });

      const [created] = await tx
        .insert(schema.billingCustomers)
        .values({
          publicationId: input.publicationId,
          subscriberId: input.subscriberId,
          userId: input.userId,
          provider: "stripe",
          providerCustomerId: customer.customerId,
          email: input.email,
        })
        .onConflictDoUpdate({
          target: [schema.billingCustomers.provider, schema.billingCustomers.providerCustomerId],
          set: {
            subscriberId: input.subscriberId,
            userId: input.userId,
            email: input.email,
            updatedAt: new Date(),
          },
        })
        .returning();

      return created;
    });
  }

  private async lockBillingCustomerKeys(
    database: BillingDatabase,
    input: {
      publicationId: string;
      subscriberId: string;
      userId: string;
    },
  ) {
    const lockKeys = [
      `billing-customer:subscriber:${input.publicationId}:${input.subscriberId}`,
      `billing-customer:user:${input.publicationId}:${input.userId}`,
    ].sort();

    for (const lockKey of lockKeys) {
      await database.select({
        locked: sql`pg_advisory_xact_lock(hashtextextended(${lockKey}, 0::bigint))`,
      });
    }
  }

  private async findBillingCustomerForCheckout(
    input: {
      publicationId: string;
      subscriberId: string;
      userId: string;
      email: string;
    },
    database: BillingDatabase = this.database,
  ) {
    const existing = await database
      .select()
      .from(schema.billingCustomers)
      .where(
        and(
          eq(schema.billingCustomers.publicationId, input.publicationId),
          eq(schema.billingCustomers.provider, "stripe"),
          sql`(
            ${schema.billingCustomers.userId} = ${input.userId}
            or ${schema.billingCustomers.subscriberId} = ${input.subscriberId}
          )`,
        ),
      )
      .limit(2);

    if (existing.length === 0) {
      return undefined;
    }

    const preferred =
      existing.find((customer) => customer.userId === input.userId) ??
      existing.find((customer) => customer.subscriberId === input.subscriberId) ??
      existing[0];
    const conflictingCustomer = existing.find(
      (customer) =>
        customer.id !== preferred.id &&
        customer.providerCustomerId !== preferred.providerCustomerId,
    );

    if (conflictingCustomer) {
      throw new Error("This account is linked to multiple Stripe customers. Please contact support.");
    }

    const [updated] = await database
      .update(schema.billingCustomers)
      .set({
        subscriberId: input.subscriberId,
        userId: input.userId,
        email: input.email,
        updatedAt: new Date(),
      })
      .where(eq(schema.billingCustomers.id, preferred.id))
      .returning();

    return updated ?? preferred;
  }

  private async findCheckoutBlockingSubscription(input: {
    publicationId: string;
    userId: string;
    providerCustomerId: string;
  }) {
    const [subscription] = await this.database
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.publicationId, input.publicationId),
          sql`(
            ${schema.subscriptions.userId} = ${input.userId}
            or ${schema.subscriptions.providerCustomerId} = ${input.providerCustomerId}
          )`,
          sql`${schema.subscriptions.status} in ('trialing', 'active', 'past_due', 'canceled')`,
          sql`(
            ${schema.subscriptions.status} != 'canceled'
            or ${schema.subscriptions.accessEndsAt} > now()
          )`,
        ),
      )
      .orderBy(desc(schema.subscriptions.updatedAt))
      .limit(1);

    return subscription;
  }

  private async subscriptionFromWebhookEvent(
    event: StripeWebhookEvent,
  ): Promise<StripeSubscriptionRecord | undefined> {
    if (event.type === "checkout.session.completed") {
      const subscriptionId = stringValue(event.data.object.subscription);
      return subscriptionId ? this.client.retrieveSubscription(subscriptionId) : undefined;
    }

    if (event.type.startsWith("customer.subscription.")) {
      return stripeSubscriptionFromObject(event.data.object);
    }

    if (event.type.startsWith("invoice.")) {
      const subscriptionId = stringValue(event.data.object.subscription);
      return subscriptionId ? this.client.retrieveSubscription(subscriptionId) : undefined;
    }

    return undefined;
  }

  private async persistStripeSubscription(
    subscription: StripeSubscriptionRecord,
    options: StripeSubscriptionPersistenceOptions = {},
  ): Promise<SubscriptionStatus> {
    const status = mapStripeStatus(subscription.status);
    const [price] = subscription.priceId
      ? await this.database
          .select()
          .from(schema.tierPrices)
          .where(
            and(
              eq(schema.tierPrices.provider, "stripe"),
              eq(schema.tierPrices.providerPriceId, subscription.priceId),
            ),
          )
          .limit(1)
      : [];

    const [customer] = await this.database
      .select()
      .from(schema.billingCustomers)
      .where(
        and(
          eq(schema.billingCustomers.provider, "stripe"),
          eq(schema.billingCustomers.providerCustomerId, subscription.customerId),
        ),
      )
      .limit(1);

    if (!customer) {
      throw new Error(`Stripe customer ${subscription.customerId} is not mapped locally.`);
    }

    const tierId = price?.tierId ?? stringValue(subscription.metadata.tierId);
    const tierPriceId = price?.id ?? stringValue(subscription.metadata.tierPriceId);
    const accessEndsAt = getAccessEndsAt(status, subscription);

    const savedStatus = await this.database.transaction(async (tx) => {
      const existing = await this.findLocalSubscription(subscription.subscriptionId, tx);

      if (existing && isOutOfOrderStripeEvent(existing.metadata, options.eventCreatedAt)) {
        return existing.status;
      }

      const values = {
        publicationId: customer.publicationId,
        subscriberId: customer.subscriberId,
        userId: customer.userId,
        tierId,
        tierPriceId,
        source: "stripe" as const,
        status,
        provider: "stripe",
        providerCustomerId: subscription.customerId,
        providerSubscriptionId: subscription.subscriptionId,
        currentPeriodStartsAt: subscription.currentPeriodStart,
        currentPeriodEndsAt: subscription.currentPeriodEnd,
        trialEndsAt: subscription.trialEnd,
        gracePeriodEndsAt:
          status === "past_due" ? addDays(subscription.currentPeriodEnd, 7) : null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
        accessEndsAt,
        metadata: {
          ...(existing?.metadata ?? {}),
          stripeStatus: subscription.status,
          productId: subscription.productId ?? "",
          priceId: subscription.priceId ?? "",
          ...(options.eventCreatedAt
            ? { stripeEventCreatedAt: options.eventCreatedAt.toISOString() }
            : {}),
          reconciledAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      };
      const [saved] = existing
        ? await tx
            .update(schema.subscriptions)
            .set(values)
            .where(eq(schema.subscriptions.id, existing.id))
            .returning()
        : await tx
            .insert(schema.subscriptions)
            .values({
              ...values,
              createdAt: new Date(),
            })
            .returning();

      await this.refreshEntitlements(tx, saved.id, customer, tierId, status, accessEndsAt);
      return status;
    });

    return savedStatus;
  }

  private async refreshEntitlements(
    database: BillingDatabase,
    subscriptionId: string,
    customer: typeof schema.billingCustomers.$inferSelect,
    tierId: string | undefined,
    status: SubscriptionStatus,
    accessEndsAt: Date | undefined,
  ) {
    await database
      .delete(schema.entitlementGrants)
      .where(eq(schema.entitlementGrants.subscriptionId, subscriptionId));

    if (!tierId || !shouldGrantEntitlements(status, accessEndsAt)) {
      return;
    }

    const [tier] = await database
      .select()
      .from(schema.subscriptionTiers)
      .where(eq(schema.subscriptionTiers.id, tierId))
      .limit(1);

    if (!tier) {
      return;
    }

    for (const entitlementKey of tier.entitlementKeys) {
      await database.insert(schema.entitlementGrants).values({
        publicationId: customer.publicationId,
        subscriberId: customer.subscriberId,
        userId: customer.userId,
        subscriptionId,
        tierId,
        entitlementKey,
        source: "subscription",
        endsAt: accessEndsAt,
      });
    }
  }

  private async claimWebhookLog(
    event: StripeWebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<ClaimedWebhookLog> {
    const [claimed] = await this.database
      .insert(schema.webhookEventLogs)
      .values({
        provider: "stripe",
        providerEventId: event.id,
        eventType: event.type,
        state: "processing",
        payload,
        attemptCount: 1,
      })
      .onConflictDoUpdate({
        target: [schema.webhookEventLogs.provider, schema.webhookEventLogs.providerEventId],
        set: {
          state: "processing",
          payload,
          attemptCount: sql`${schema.webhookEventLogs.attemptCount} + 1`,
          lastError: null,
        },
        setWhere: sql`${schema.webhookEventLogs.state} in ('received', 'failed')`,
      })
      .returning();

    if (claimed) {
      return {
        state: "claimed",
        logState: "processing",
      };
    }

    const [existing] = await this.database
      .select()
      .from(schema.webhookEventLogs)
      .where(
        and(
          eq(schema.webhookEventLogs.provider, "stripe"),
          eq(schema.webhookEventLogs.providerEventId, event.id),
        ),
      )
      .limit(1);

    if (existing?.state === "processed" || existing?.state === "ignored") {
      return {
        state: existing.state,
        logState: existing.state,
      };
    }

    return {
      state: "processing_duplicate",
      logState:
        existing?.state === "received" || existing?.state === "failed"
          ? existing.state
          : "processing",
    };
  }

  private async markWebhookLog(
    providerEventId: string,
    state: "processed" | "ignored" | "failed",
    lastError?: string,
  ) {
    await this.database
      .update(schema.webhookEventLogs)
      .set({
        state,
        lastError,
        processedAt: state === "processed" || state === "ignored" ? new Date() : undefined,
      })
      .where(
        and(
          eq(schema.webhookEventLogs.provider, "stripe"),
          eq(schema.webhookEventLogs.providerEventId, providerEventId),
          eq(schema.webhookEventLogs.state, "processing"),
        ),
      );
  }

  private async findLocalSubscription(
    providerSubscriptionId: string,
    database: BillingDatabase = this.database,
  ) {
    const [subscription] = await database
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.provider, "stripe"),
          eq(schema.subscriptions.providerSubscriptionId, providerSubscriptionId),
        ),
      )
      .limit(1);

    return subscription;
  }
}

export type CheckoutTier = {
  id: string;
  slug: string;
  name: string;
  description: string;
  entitlementKeys: string[];
  prices: Array<{
    id: string;
    interval: string;
    amountCents: number;
    currency: string;
    providerPriceId: string | null;
  }>;
};

export type AccountBillingStatus = {
  status: SubscriptionStatus | "none";
  label: string;
  tierName?: string;
  interval?: string;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  canOpenPortal: boolean;
};

export type ReconciliationResult = {
  checkedCustomers: number;
  updatedSubscriptions: number;
  discrepancies: string[];
};

function stripeSubscriptionFromObject(object: Record<string, unknown>): StripeSubscriptionRecord {
  const items = object.items as { data?: Array<{ price?: { id?: string; product?: unknown } }> };
  const price = items?.data?.[0]?.price;
  const metadata = object.metadata as Record<string, string> | undefined;

  return {
    customerId: String(object.customer ?? ""),
    subscriptionId: String(object.id ?? ""),
    status: String(object.status ?? ""),
    priceId: price?.id,
    productId:
      typeof price?.product === "string"
        ? price.product
        : typeof price?.product === "object" && price.product
          ? String((price.product as { id?: unknown }).id ?? "")
          : undefined,
    currentPeriodStart: fromUnixNumber(object.current_period_start),
    currentPeriodEnd: fromUnixNumber(object.current_period_end),
    trialEnd: fromUnixNumber(object.trial_end),
    cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
    canceledAt: fromUnixNumber(object.canceled_at),
    metadata: metadata ?? {},
  };
}

function mapStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return status;
    default:
      return "incomplete";
  }
}

function getAccessEndsAt(status: SubscriptionStatus, subscription: StripeSubscriptionRecord) {
  if (status === "active" || status === "trialing" || status === "canceled" || status === "unpaid") {
    return subscription.currentPeriodEnd;
  }

  if (status === "past_due") {
    return addDays(subscription.currentPeriodEnd, 7);
  }

  return undefined;
}

function statusLabel(status: SubscriptionStatus) {
  switch (status) {
    case "trialing":
      return "Trialing";
    case "active":
      return "Active";
    case "past_due":
    case "grace_period":
      return "Payment needs attention";
    case "canceled":
      return "Canceled";
    case "unpaid":
      return "Unpaid";
    case "comped":
      return "Complimentary";
    case "free":
      return "Free";
    default:
      return "Not active";
  }
}

function addDays(date: Date | undefined, days: number) {
  return date ? new Date(date.getTime() + days * 24 * 60 * 60 * 1000) : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function fromUnixNumber(value: unknown) {
  return typeof value === "number" && value > 0 ? new Date(value * 1000) : undefined;
}

function checkoutIdempotencyKey(input: { publicationId: string; userId: string }) {
  return `checkout:${input.publicationId}:${input.userId}`;
}

function customerIdempotencyKey(input: { publicationId: string; userId: string }) {
  return `customer:${input.publicationId}:${input.userId}`;
}

function stripeEventSecondPrecision(date: Date) {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

function shouldGrantEntitlements(status: SubscriptionStatus, accessEndsAt: Date | undefined) {
  if (!ENTITLED_STATUSES.has(status)) {
    return false;
  }

  if (status === "past_due" || status === "canceled" || status === "unpaid") {
    return Boolean(accessEndsAt && accessEndsAt.getTime() > Date.now());
  }

  return !accessEndsAt || accessEndsAt.getTime() > Date.now();
}

function isOutOfOrderStripeEvent(
  metadata: Record<string, unknown> | undefined,
  eventCreatedAt: Date | undefined,
) {
  if (!eventCreatedAt) {
    return false;
  }

  const previousEventCreatedAt = stringValue(metadata?.stripeEventCreatedAt);

  if (!previousEventCreatedAt) {
    return false;
  }

  const previous = new Date(previousEventCreatedAt);

  return (
    !Number.isNaN(previous.getTime()) &&
    stripeEventSecondPrecision(previous).getTime() >
      stripeEventSecondPrecision(eventCreatedAt).getTime()
  );
}
