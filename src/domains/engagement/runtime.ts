import { createHash, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getAllPostSlugs, getPostBySlug } from "@/src/content/posts";
import { getCurrentAuthSession } from "../auth/server/runtime";
import type { EmailProvider } from "../email";
import { InMemoryRateLimitStore } from "../moderation";
import { createEngagementPostMetadata } from "./post-metadata";
import { InMemoryEngagementRepository, PostgresEngagementRepository } from "./repository";
import { EngagementService } from "./service";
import type { EngagementActor, EngagementRequestContext } from "./types";

const actorCookieName = "qscm_actor_id";
const fallbackRepository = new InMemoryEngagementRepository(getAllPostSlugs());
const runtimeRateLimitStore = new InMemoryRateLimitStore();

export async function getEngagementService() {
  if (process.env.DATABASE_URL) {
    const { db } = await import("@/src/db");
    return new EngagementService(
      new PostgresEngagementRepository(db, {
        resolvePostMetadata: resolvePostMetadataFromMdx,
      }),
      {
        scopedRateLimitStore: runtimeRateLimitStore,
      },
    );
  }

  return new EngagementService(fallbackRepository, {
    scopedRateLimitStore: runtimeRateLimitStore,
  });
}

export async function getRequestEngagementContext() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const actorId = cookieStore.get(actorCookieName)?.value ?? randomUUID();
  const ip = firstForwardedValue(headerStore.get("x-forwarded-for")) ?? "unknown";
  const userAgent = headerStore.get("user-agent") ?? "unknown";
  const salt = process.env.ENGAGEMENT_HASH_SALT ?? "qscm-dev-engagement-salt";
  const anonymousActorHash = hashValue(`${salt}:${actorId}`);
  const auth = await getCurrentAuthSession();
  const requestContext: EngagementRequestContext = {
    anonymousActorHash,
    ipHash: hashValue(`${salt}:ip:${ip}`),
    userAgentHash: hashValue(`${salt}:ua:${userAgent}`),
    sessionIdHash: auth?.session.id ? hashValue(`${salt}:session:${auth.session.id}`) : undefined,
  };
  const actor: EngagementActor = auth
    ? {
        kind: "registered_user",
        userId: auth.user.id,
        anonymousActorHash,
      }
    : {
        kind: "anonymous",
        anonymousActorHash,
      };

  return {
    actor,
    requestContext,
    actorCookie:
      cookieStore.get(actorCookieName)?.value === actorId
        ? undefined
        : {
            name: actorCookieName,
            value: actorId,
          },
  };
}

export function createNoopEmailProvider(): EmailProvider | undefined {
  return undefined;
}

function resolvePostMetadataFromMdx(postSlug: string) {
  const post = getPostBySlug(postSlug, { includeUnpublished: true });
  return post ? createEngagementPostMetadata(post) : undefined;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim();
}
