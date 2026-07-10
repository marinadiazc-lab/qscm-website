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
  prices: Array<{ interval: "month" | "year"; amountCents: number }>;
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
        updatedAt: new Date(),
      },
    })
    .returning();

  await seedPrices(tier, input.prices);
}

async function seedPrices(
  tier: SubscriptionTier,
  prices: Array<{ interval: "month" | "year"; amountCents: number }>,
) {
  for (const price of prices) {
    await db
      .insert(tierPrices)
      .values({
        tierId: tier.id,
        interval: price.interval,
        amountCents: price.amountCents,
        currency: "usd",
        activeForCheckout: true,
      })
      .onConflictDoUpdate({
        target: [tierPrices.tierId, tierPrices.interval],
        set: {
          amountCents: price.amountCents,
          currency: "usd",
          activeForCheckout: true,
          updatedAt: new Date(),
        },
      });
  }
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
    entitlementKeys: ["paid_content", "private_podcast", "tier:supporter"],
    prices: [
      { interval: "month", amountCents: 700 },
      { interval: "year", amountCents: 7000 },
    ],
  });

  await seedTier({
    publicationId: publication.id,
    slug: "founding-member",
    name: "Founding Member",
    description: "Everything in Supporter plus founding member access.",
    sortOrder: 20,
    defaultGracePeriodDays: 14,
    entitlementKeys: [
      "paid_content",
      "private_podcast",
      "tier:supporter",
      "tier:founding-member",
    ],
    prices: [
      { interval: "month", amountCents: 1500 },
      { interval: "year", amountCents: 15000 },
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
