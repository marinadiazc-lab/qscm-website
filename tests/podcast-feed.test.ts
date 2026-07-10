import { describe, expect, it } from "vitest";
import {
  buildPodcastRssFeed,
  canPrivateFeedTokenAccessEpisode,
  canPrivateFeedTokenAccessShow,
  isPrivateFeedTokenActive,
  sortEpisodesForFeed,
  type PodcastEpisode,
  type PodcastShow,
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
