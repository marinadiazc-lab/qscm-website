import {
  canPrivateFeedTokenAccessEpisode,
  canPrivateFeedTokenAccessShow,
} from "./access";
import type {
  PodcastAudioDeliveryMode,
  PodcastEpisode,
  PodcastFeedGenerationInput,
  PodcastFeedGenerationResult,
  PodcastRssFeed,
  PodcastRssItem,
  PodcastShow,
} from "./types";
import type { MediaAsset } from "../media";

export function buildPodcastRssFeed(
  input: PodcastFeedGenerationInput,
): PodcastFeedGenerationResult {
  const generatedAt = input.generatedAt ?? new Date();
  const showDecision = canPrivateFeedTokenAccessShow({
    token: input.token,
    show: input.show,
    entitlement: input.entitlement,
    resolveEntitlement: input.resolveEntitlement,
    now: generatedAt,
  });

  if (!showDecision.allowed) {
    return {
      allowed: false,
      decision: showDecision,
      deniedEpisodeIds: input.episodes.map((episode) => episode.id),
    };
  }

  const accessibleEpisodes: PodcastEpisode[] = [];
  const deniedEpisodeIds: string[] = [];

  for (const episode of input.episodes) {
    const episodeDecision = canPrivateFeedTokenAccessEpisode({
      token: input.token,
      show: input.show,
      episode,
      entitlement: input.entitlement,
      resolveEntitlement: input.resolveEntitlement,
      now: generatedAt,
    });

    if (episodeDecision.allowed) {
      accessibleEpisodes.push(episode);
    } else {
      deniedEpisodeIds.push(episode.id);
    }
  }

  const limitedEpisodes = sortEpisodesForFeed(accessibleEpisodes).slice(
    0,
    input.limit,
  );

  return {
    allowed: true,
    decision: showDecision,
    feed: toRssFeed(input.show, limitedEpisodes, generatedAt),
    deniedEpisodeIds,
  };
}

export function toRssFeed(
  show: PodcastShow,
  episodes: readonly PodcastEpisode[],
  generatedAt: Date,
): PodcastRssFeed {
  return {
    title: show.title,
    description: show.description,
    link: show.siteUrl,
    feedUrl: show.feedUrl,
    language: show.language,
    authorName: show.authorName,
    owner: show.owner,
    imageUrl: show.coverImageUrl,
    explicit: show.explicit,
    generatedAt,
    delivery: {
      feedAccess: "private_rss_bearer_token",
      audioAccess: getFeedAudioDeliveryMode(episodes),
    },
    items: episodes.map((episode) => toRssItem(show, episode)),
  };
}

export function toRssItem(
  show: PodcastShow,
  episode: PodcastEpisode,
): PodcastRssItem {
  return {
    guid: episode.guid,
    title: episode.title,
    description: episode.description,
    link: `${trimTrailingSlash(show.siteUrl)}/podcast/${episode.slug}`,
    publishedAt: episode.publishedAt ?? episode.createdAt,
    updatedAt: episode.updatedAt,
    durationSeconds: episode.enclosure.durationSeconds,
    explicit: episode.explicit ?? show.explicit,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    enclosure: {
      url: episode.enclosure.url,
      type: episode.enclosure.mimeType,
      length: episode.enclosure.byteLength,
    },
  };
}

export function sortEpisodesForFeed(episodes: readonly PodcastEpisode[]) {
  return [...episodes].sort((left, right) => {
    const leftPublishedAt = left.publishedAt ?? left.createdAt;
    const rightPublishedAt = right.publishedAt ?? right.createdAt;

    return rightPublishedAt.getTime() - leftPublishedAt.getTime();
  });
}

function getFeedAudioDeliveryMode(episodes: readonly PodcastEpisode[]) {
  const hasSignedAudio = episodes.some(
    (episode) => episode.enclosure.deliveryMode === "strict_signed_audio_url",
  );

  return hasSignedAudio ? "strict_signed_audio_url" : "stable_cdn_obscure_url";
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function mediaAssetToPodcastEnclosure(
  asset: Pick<
    MediaAsset,
    | "kind"
    | "stablePath"
    | "publicUrl"
    | "mimeType"
    | "byteLength"
    | "durationSeconds"
    | "checksumSha256"
    | "objectKey"
    | "access"
  >,
  options: {
    baseUrl?: string;
    deliveryMode?: PodcastAudioDeliveryMode;
  } = {},
) {
  if (asset.kind !== "audio") {
    throw new Error("Podcast enclosures require an audio media asset.");
  }

  if (!asset.mimeType) {
    throw new Error("Podcast enclosures require a MIME type.");
  }

  const deliveryMode =
    options.deliveryMode ??
    (asset.access === "public" ? "stable_cdn_obscure_url" : "strict_signed_audio_url");

  return {
    url: absoluteUrl(asset.publicUrl ?? asset.stablePath, options.baseUrl),
    mimeType: asset.mimeType,
    byteLength: asset.byteLength,
    durationSeconds: asset.durationSeconds,
    deliveryMode,
    cdnObjectKey: asset.objectKey,
    checksumSha256: asset.checksumSha256,
  };
}

function absoluteUrl(value: string, baseUrl?: string) {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (!baseUrl) {
    return value;
  }

  return new URL(value, baseUrl).toString();
}
