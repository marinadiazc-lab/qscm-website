import { config } from "dotenv";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  publications,
  subscriptionTiers,
  tierPrices,
  userRoles,
  users,
  type SubscriptionTier,
} from "../src/db/schema";

config({ path: ".env.local" });
config();

const databaseUrl = process.env.DATABASE_URL;
const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.local").trim().toLowerCase();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. See docs/database.md for local setup.");
}

const client = postgres(databaseUrl, { max: 1, prepare: false });
const db = drizzle(client);

async function seedPublication() {
  const [publication] = await db
    .insert(publications)
    .values({
      slug: "qscm",
      name: "QSCM",
      description: "The first QSCM publication.",
      status: "active",
    })
    .onConflictDoUpdate({
      target: publications.slug,
      set: {
        name: "QSCM",
        description: "The first QSCM publication.",
        status: "active",
        updatedAt: new Date(),
      },
    })
    .returning();

  return publication;
}

async function seedTier(input: {
  publicationId: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  defaultGracePeriodDays: number;
  entitlementKeys: string[];
  providerProductId?: string;
  prices: Array<{
    interval: "month" | "year";
    amountCents: number;
    providerPriceId?: string;
  }>;
}) {
  const [tier] = await db
    .insert(subscriptionTiers)
    .values({
      publicationId: input.publicationId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      status: "active",
      sortOrder: input.sortOrder,
      defaultGracePeriodDays: input.defaultGracePeriodDays,
      entitlementKeys: input.entitlementKeys,
      provider: input.providerProductId ? "stripe" : undefined,
      providerProductId: input.providerProductId,
    })
    .onConflictDoUpdate({
      target: [subscriptionTiers.publicationId, subscriptionTiers.slug],
      set: {
        name: input.name,
        description: input.description,
        status: "active",
        sortOrder: input.sortOrder,
        defaultGracePeriodDays: input.defaultGracePeriodDays,
        entitlementKeys: input.entitlementKeys,
        provider: input.providerProductId ? "stripe" : null,
        providerProductId: input.providerProductId ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  await seedPrices(tier, input.prices);
}

async function seedPrices(
  tier: SubscriptionTier,
  prices: Array<{
    interval: "month" | "year";
    amountCents: number;
    providerPriceId?: string;
  }>,
) {
  for (const price of prices) {
    const existingPrice = await findSeedPrice(tier.id, price.interval, price.providerPriceId);

    await db
      .insert(tierPrices)
      .values({
        id: existingPrice?.id,
        tierId: tier.id,
        interval: price.interval,
        amountCents: price.amountCents,
        currency: "usd",
        activeForCheckout: Boolean(price.providerPriceId),
        provider: price.providerPriceId ? "stripe" : undefined,
        providerPriceId: price.providerPriceId,
      })
      .onConflictDoUpdate({
        target: tierPrices.id,
        set: {
          amountCents: price.amountCents,
          currency: "usd",
          activeForCheckout: Boolean(price.providerPriceId),
          provider: price.providerPriceId ? "stripe" : null,
          providerPriceId: price.providerPriceId ?? null,
          updatedAt: new Date(),
        },
      });
  }
}

async function findSeedPrice(
  tierId: string,
  interval: "month" | "year",
  providerPriceId: string | undefined,
) {
  if (providerPriceId) {
    const [byProvider] = await db
      .select()
      .from(tierPrices)
      .where(
        sql`${tierPrices.provider} = 'stripe' and ${tierPrices.providerPriceId} = ${providerPriceId}`,
      )
      .limit(1);

    if (byProvider) {
      return byProvider;
    }
  }

  const [activeLocal] = await db
    .select()
    .from(tierPrices)
    .where(
      sql`${tierPrices.tierId} = ${tierId} and ${tierPrices.interval} = ${interval} and ${tierPrices.activeForCheckout} is true`,
    )
    .limit(1);

  return activeLocal;
}

async function seedAdminUser() {
  const [existingAdmin] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${adminEmail}`)
    .limit(1);

  const [admin] = existingAdmin
    ? await db
        .update(users)
        .set({
          displayName: "QSCM Admin",
          status: "active",
          metadata: {
            seeded: true,
            source: "scripts/seed.ts",
          },
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingAdmin.id))
        .returning()
    : await db
        .insert(users)
        .values({
          email: adminEmail,
          displayName: "QSCM Admin",
          status: "active",
          metadata: {
            seeded: true,
            source: "scripts/seed.ts",
          },
        })
        .returning();

  await db
    .insert(userRoles)
    .values({
      userId: admin.id,
      role: "admin",
    })
    .onConflictDoNothing({
      target: [userRoles.userId, userRoles.role],
    });

  return admin;
}

async function main() {
  const publication = await seedPublication();
  const admin = await seedAdminUser();

  await seedTier({
    publicationId: publication.id,
    slug: "supporter",
    name: "Supporter",
    description: "Paid posts and the private podcast feed.",
    sortOrder: 10,
    defaultGracePeriodDays: 7,
    providerProductId: process.env.STRIPE_SUPPORTER_PRODUCT_ID,
    entitlementKeys: ["paid_content", "private_podcast", "tier:supporter"],
    prices: [
      {
        interval: "month",
        amountCents: 700,
        providerPriceId: process.env.STRIPE_SUPPORTER_MONTHLY_PRICE_ID,
      },
      {
        interval: "year",
        amountCents: 7000,
        providerPriceId: process.env.STRIPE_SUPPORTER_ANNUAL_PRICE_ID,
      },
    ],
  });

  await seedTier({
    publicationId: publication.id,
    slug: "founding-member",
    name: "Founding Member",
    description: "Everything in Supporter plus founding member access.",
    sortOrder: 20,
    defaultGracePeriodDays: 14,
    providerProductId: process.env.STRIPE_FOUNDING_MEMBER_PRODUCT_ID,
    entitlementKeys: [
      "paid_content",
      "private_podcast",
      "tier:supporter",
      "tier:founding-member",
    ],
    prices: [
      {
        interval: "month",
        amountCents: 1500,
        providerPriceId: process.env.STRIPE_FOUNDING_MEMBER_MONTHLY_PRICE_ID,
      },
      {
        interval: "year",
        amountCents: 15000,
        providerPriceId: process.env.STRIPE_FOUNDING_MEMBER_ANNUAL_PRICE_ID,
      },
    ],
  });

  const tiers = await db
    .select()
    .from(subscriptionTiers)
    .where(eq(subscriptionTiers.publicationId, publication.id));

  console.log(
    `Seeded publication ${publication.slug} with ${tiers.length} tiers and admin ${admin.email}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
