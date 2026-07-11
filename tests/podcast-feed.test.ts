import { describe, expect, it } from "vitest";
import {
  buildPodcastRssFeed,
  buildPrivateFeedUrl,
  buildPrivatePodcastFeed,
  canPrivateFeedTokenAccessEpisode,
  canPrivateFeedTokenAccessShow,
  detectPrivateFeedSharingSignal,
  hashPrivateFeedToken,
  issuePrivateFeedToken,
  isPrivateFeedTokenActive,
  revokePrivateFeedToken,
  rotatePrivateFeedToken,
  serializePodcastRss,
  sortEpisodesForFeed,
  type PodcastEpisode,
  type PodcastRepository,
  type PodcastShow,
  type PrivateFeedDeniedProbe,
  type PrivateFeedTokenAuditEvent,
  type PrivateFeedToken,
} from "../src/domains/podcast";

const now = new Date("2026-07-10T12:00:00.000Z");

function show(overrides: Partial<PodcastShow> = {}): PodcastShow {
  return {
    id: "show_1",
    publicationId: "pub_1",
    slug: "main",
    title: "QSCM Audio",
    description: "Private member audio.",
    status: "active",
    language: "en",
    siteUrl: "https://qscm.example",
    defaultAccessRule: { kind: "entitlement", requiredEntitlementKeys: ["private_podcast"] },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function token(overrides: Partial<PrivateFeedToken> = {}): PrivateFeedToken {
  return {
    id: "token_1",
    publicationId: "pub_1",
    showId: "show_1",
    subscriberId: "subscriber_1",
    tokenHash: "token_hash",
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function episode(overrides: Partial<PodcastEpisode> = {}): PodcastEpisode {
  return {
    id: "episode_1",
    showId: "show_1",
    slug: "episode-one",
    guid: "guid_1",
    title: "Episode one",
    description: "The first episode.",
    status: "published",
    visibility: "private",
    enclosure: {
      url: "https://cdn.example/audio.mp3",
      mimeType: "audio/mpeg",
      byteLength: 100,
      durationSeconds: 90,
      deliveryMode: "stable_cdn_obscure_url",
    },
    createdAt: new Date("2026-07-08T12:00:00.000Z"),
    updatedAt: new Date("2026-07-08T12:00:00.000Z"),
    publishedAt: new Date("2026-07-09T12:00:00.000Z"),
    ...overrides,
  };
}

describe("private podcast token access", () => {
  it("treats revoked, rotated, and expired tokens as inactive for feed access", () => {
    expect(isPrivateFeedTokenActive(token(), { now })).toBe(true);
    expect(isPrivateFeedTokenActive(token({ revokedAt: now }), { now })).toBe(false);
    expect(isPrivateFeedTokenActive(token({ rotatedAt: now }), { now })).toBe(false);
    expect(isPrivateFeedTokenActive(token({ expiresAt: now }), { now })).toBe(false);
  });

  it("denies show access for publication, show, and inactive-show mismatches", () => {
    expect(
      canPrivateFeedTokenAccessShow({
        token: token({ publicationId: "other" }),
        show: show(),
        now,
      }),
    ).toMatchObject({ allowed: false, reason: "token_publication_mismatch" });

    expect(
      canPrivateFeedTokenAccessShow({
        token: token({ showId: "other_show" }),
        show: show(),
        now,
      }),
    ).toMatchObject({ allowed: false, reason: "token_show_mismatch" });

    expect(
      canPrivateFeedTokenAccessShow({
        token: token(),
        show: show({ status: "archived" }),
        now,
      }),
    ).toMatchObject({ allowed: false, reason: "show_inactive" });
  });

  it("requires entitlement data for entitlement-gated shows and episodes", () => {
    expect(
      canPrivateFeedTokenAccessShow({
        token: token(),
        show: show(),
        now,
      }),
    ).toMatchObject({ allowed: false, reason: "entitlement_required" });

    expect(
      canPrivateFeedTokenAccessEpisode({
        token: token(),
        show: show(),
        episode: episode(),
        entitlement: {
          allowed: true,
          reason: "paid",
          checkedAt: now,
          entitlementKeys: ["private_podcast"],
        },
        now,
      }),
    ).toMatchObject({ allowed: true, reason: "allowed_entitlement" });
  });
});

describe("RSS feed generation", () => {
  it("sorts accessible episodes newest first, applies limits, and tracks denied episodes", () => {
    const older = episode({ id: "older", guid: "older", slug: "older" });
    const newer = episode({
      id: "newer",
      guid: "newer",
      slug: "newer",
      publishedAt: new Date("2026-07-10T11:00:00.000Z"),
      enclosure: {
        ...episode().enclosure,
        deliveryMode: "strict_signed_audio_url",
      },
    });
    const scheduled = episode({
      id: "scheduled",
      guid: "scheduled",
      slug: "scheduled",
      status: "scheduled",
      publishedAt: new Date("2026-07-11T12:00:00.000Z"),
    });

    const result = buildPodcastRssFeed({
      show: show(),
      token: token(),
      episodes: [older, newer, scheduled],
      entitlement: {
        allowed: true,
        reason: "paid",
        checkedAt: now,
        entitlementKeys: ["private_podcast"],
      },
      generatedAt: now,
      limit: 1,
    });

    expect(result.allowed).toBe(true);
    expect(result.deniedEpisodeIds).toEqual(["scheduled"]);
    expect(result.feed?.items.map((item) => item.guid)).toEqual(["newer"]);
    expect(result.feed?.delivery.audioAccess).toBe("strict_signed_audio_url");
  });

  it("denies every episode when the show itself is inaccessible", () => {
    const result = buildPodcastRssFeed({
      show: show({ status: "archived" }),
      token: token(),
      episodes: [episode({ id: "episode_1" }), episode({ id: "episode_2" })],
      generatedAt: now,
    });

    expect(result).toMatchObject({
      allowed: false,
      deniedEpisodeIds: ["episode_1", "episode_2"],
    });
    expect(result.feed).toBeUndefined();
  });

  it("sorts feed episodes by published date falling back to creation date", () => {
    expect(
      sortEpisodesForFeed([
        episode({ id: "created-new", publishedAt: undefined, createdAt: new Date("2026-07-10") }),
        episode({ id: "published-newer", publishedAt: new Date("2026-07-11") }),
      ]).map((item) => item.id),
    ).toEqual(["published-newer", "created-new"]);
  });
});

describe("private feed token service", () => {
  it("hashes raw feed tokens without storing the raw token", async () => {
    const repository = new InMemoryPodcastRepository({
      shows: [show()],
      episodes: [episode()],
    });
    const result = await issuePrivateFeedToken({
      repository,
      publicationId: "pub_1",
      show: show(),
      subscriberId: "subscriber_1",
      baseUrl: "https://qscm.example",
      now,
    });

    expect(result.rawToken).not.toBe(result.token.tokenHash);
    expect(result.token.tokenHash).toBe(hashPrivateFeedToken(result.rawToken));
    expect(result.feedUrl).toBe(
      buildPrivateFeedUrl({
        baseUrl: "https://qscm.example",
        showSlug: "main",
        rawToken: result.rawToken,
      }),
    );
    expect(repository.auditEvents.map((event) => event.kind)).toEqual(["issued"]);
  });

  it("rotates and revokes tokens while preserving audit history", async () => {
    const repository = new InMemoryPodcastRepository();
    const issued = await issuePrivateFeedToken({
      repository,
      publicationId: "pub_1",
      show: show(),
      now,
    });
    const rotated = await rotatePrivateFeedToken({
      repository,
      tokenId: issued.token.id,
      publicationId: "pub_1",
      show: show(),
      now,
    });
    const oldToken = await repository.findTokenById(issued.token.id);

    expect(rotated?.token.id).not.toBe(issued.token.id);
    expect(oldToken).toMatchObject({
      status: "rotated",
      rotatedToTokenId: rotated?.token.id,
    });

    const revoked = await revokePrivateFeedToken({
      repository,
      tokenId: rotated!.token.id,
      now,
    });

    expect(revoked).toMatchObject({ status: "revoked", revokedAt: now });
    expect(repository.auditEvents.map((event) => event.kind)).toEqual([
      "issued",
      "issued",
      "rotated",
      "revoked",
    ]);
  });

  it("preserves show scope when rotating tokens without a show argument", async () => {
    const repository = new InMemoryPodcastRepository();
    const issued = await issuePrivateFeedToken({
      repository,
      publicationId: "pub_1",
      show: show(),
      now,
    });
    const rotated = await rotatePrivateFeedToken({
      repository,
      tokenId: issued.token.id,
      publicationId: "pub_1",
      now,
    });

    expect(rotated?.token).toMatchObject({
      publicationId: "pub_1",
      showId: "show_1",
      subscriberId: issued.token.subscriberId,
      userId: issued.token.userId,
    });
    expect(rotated?.feedUrl).toBeUndefined();
  });

  it("builds a private feed from a raw token and records access decisions", async () => {
    const repository = new InMemoryPodcastRepository({
      shows: [show({ defaultAccessRule: { kind: "private_token" } })],
      episodes: [episode()],
    });
    const issued = await issuePrivateFeedToken({
      repository,
      publicationId: "pub_1",
      show: show(),
      now,
    });
    const result = await buildPrivatePodcastFeed({
      repository,
      showSlug: "main",
      rawToken: issued.rawToken,
      generatedAt: now,
      requestContext: {
        ipAddress: "203.0.113.1",
        userAgent: "PodcastApp/1.0",
      },
    });

    expect(result.status).toBe(200);
    expect(result.allowed).toBe(true);
    expect(result.feed?.items).toHaveLength(1);
    expect(repository.auditEvents.at(-1)).toMatchObject({
      kind: "access_granted",
      tokenId: issued.token.id,
      reason: "allowed_private_token",
    });
  });

  it("audits denied requests for known tokens and records unknown-token probes", async () => {
    const repository = new InMemoryPodcastRepository({
      shows: [show({ defaultAccessRule: { kind: "private_token" } })],
      episodes: [episode()],
    });
    const issued = await issuePrivateFeedToken({
      repository,
      publicationId: "pub_1",
      show: show(),
      now,
    });
    const missingShow = await buildPrivatePodcastFeed({
      repository,
      showSlug: "missing",
      rawToken: issued.rawToken,
      generatedAt: now,
    });
    const unknownToken = await buildPrivatePodcastFeed({
      repository,
      showSlug: "main",
      rawToken: "not-a-real-token",
      generatedAt: now,
    });

    expect(missingShow).toMatchObject({
      allowed: false,
      status: 404,
      reason: "show_not_found",
    });
    expect(repository.auditEvents.at(-1)).toMatchObject({
      kind: "access_denied",
      tokenId: issued.token.id,
      reason: "show_not_found",
    });
    expect(unknownToken).toMatchObject({
      allowed: false,
      status: 401,
      reason: "token_not_found",
    });
    expect(repository.deniedProbes.at(-1)).toMatchObject({
      showSlug: "main",
      reason: "token_not_found",
      tokenHash: hashPrivateFeedToken("not-a-real-token"),
    });
    expect(repository.deniedProbes.at(-1)?.publicationId).toBeUndefined();
    expect(repository.deniedProbes.at(-1)?.showId).toBeUndefined();
  });

  it("returns forbidden when a valid scoped token requests a different show", async () => {
    const repository = new InMemoryPodcastRepository({
      shows: [
        show({ defaultAccessRule: { kind: "private_token" } }),
        show({
          id: "show_2",
          slug: "other",
          defaultAccessRule: { kind: "private_token" },
        }),
      ],
      episodes: [episode({ showId: "show_2" })],
    });
    const issued = await issuePrivateFeedToken({
      repository,
      publicationId: "pub_1",
      show: show(),
      now,
    });
    const result = await buildPrivatePodcastFeed({
      repository,
      showSlug: "other",
      rawToken: issued.rawToken,
      generatedAt: now,
    });

    expect(result).toMatchObject({
      allowed: false,
      status: 403,
      reason: "token_show_mismatch",
    });
  });

  it("scopes show lookup to the token publication when slugs overlap", async () => {
    const repository = new InMemoryPodcastRepository({
      shows: [
        show({
          id: "show_other",
          publicationId: "pub_other",
          defaultAccessRule: { kind: "private_token" },
        }),
        show({ defaultAccessRule: { kind: "private_token" } }),
      ],
      episodes: [episode()],
    });
    const issued = await issuePrivateFeedToken({
      repository,
      publicationId: "pub_1",
      show: show(),
      now,
    });
    const result = await buildPrivatePodcastFeed({
      repository,
      showSlug: "main",
      rawToken: issued.rawToken,
      generatedAt: now,
    });

    expect(result).toMatchObject({
      allowed: true,
      status: 200,
      show: {
        id: "show_1",
        publicationId: "pub_1",
      },
    });
  });

  it("serializes compatibility-first podcast RSS with normal enclosures", () => {
    const rss = serializePodcastRss(
      buildPodcastRssFeed({
        show: show({
          defaultAccessRule: { kind: "private_token" },
          feedUrl: "https://qscm.example/podcast/main/token/rss.xml",
        }),
        token: token(),
        episodes: [episode()],
        generatedAt: now,
      }).feed!,
    );

    expect(rss).toContain("<rss version=\"2.0\"");
    expect(rss).toContain("xmlns:itunes=");
    expect(rss).toContain("<enclosure url=\"https://cdn.example/audio.mp3\"");
    expect(rss).not.toContain("Authorization");
  });

  it("flags likely feed sharing by IP or user-agent spread", () => {
    const events = Array.from({ length: 6 }, (_, index): PrivateFeedTokenAuditEvent => ({
      id: `event_${index}`,
      tokenId: "token_1",
      kind: "access_granted",
      occurredAt: now,
      requestContext: {
        ipAddress: `203.0.113.${index}`,
        userAgent: "PodcastApp/1.0",
      },
    }));

    expect(
      detectPrivateFeedSharingSignal({
        tokenId: "token_1",
        events,
        now,
      }),
    ).toMatchObject({
      suspicious: true,
      reason: "ip_address_spread",
      distinctIpAddresses: 6,
    });
  });
});

class InMemoryPodcastRepository implements PodcastRepository {
  readonly auditEvents: PrivateFeedTokenAuditEvent[] = [];
  readonly deniedProbes: PrivateFeedDeniedProbe[] = [];
  private readonly shows: PodcastShow[] = [];
  private readonly episodes = new Map<string, PodcastEpisode[]>();
  private readonly tokens = new Map<string, PrivateFeedToken>();

  constructor(seed: { shows?: PodcastShow[]; episodes?: PodcastEpisode[] } = {}) {
    this.shows.push(...(seed.shows ?? []));
    seed.episodes?.forEach((item) => {
      this.episodes.set(item.showId, [...(this.episodes.get(item.showId) ?? []), item]);
    });
  }

  findShowBySlug(slug: string, publicationId?: string) {
    return this.shows.find(
      (item) => item.slug === slug && (!publicationId || item.publicationId === publicationId),
    );
  }

  listPublishedEpisodesForShow(showId: string, checkedAt: Date) {
    return (this.episodes.get(showId) ?? []).filter(
      (item) =>
        item.status === "published" &&
        item.publishedAt &&
        item.publishedAt.getTime() <= checkedAt.getTime(),
    );
  }

  findTokenByHash(tokenHash: string) {
    return Array.from(this.tokens.values()).find((item) => item.tokenHash === tokenHash);
  }

  findTokenById(tokenId: string) {
    return this.tokens.get(tokenId);
  }

  saveToken(privateFeedToken: PrivateFeedToken) {
    this.tokens.set(privateFeedToken.id, privateFeedToken);
    return privateFeedToken;
  }

  recordAuditEvent(event: PrivateFeedTokenAuditEvent) {
    this.auditEvents.push(event);
  }

  recordDeniedFeedProbe(probe: PrivateFeedDeniedProbe) {
    this.deniedProbes.push(probe);
  }
}
