import {
  buildPrivatePodcastFeed,
  serializePodcastRss,
} from "@/src/domains/podcast";
import { getPodcastRepository } from "@/src/domains/podcast/runtime";

export const dynamic = "force-dynamic";

interface PrivatePodcastRouteProps {
  params: Promise<{
    showSlug: string;
    token: string;
  }>;
}

export async function GET(request: Request, props: PrivatePodcastRouteProps) {
  const { showSlug, token } = await props.params;
  const generatedAt = new Date();
  const result = await buildPrivatePodcastFeed({
    repository: getPodcastRepository(),
    showSlug,
    rawToken: token,
    generatedAt,
    requestContext: {
      ipAddress: getForwardedIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
      referer: request.headers.get("referer") ?? undefined,
    },
  });

  if (!result.allowed || !result.feed) {
    return new Response(result.reason, {
      status: result.status,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  return new Response(serializePodcastRss(result.feed), {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Type": "application/rss+xml; charset=utf-8",
      "X-Podcast-Audio-Delivery": result.feed.delivery.audioAccess,
    },
  });
}

function getForwardedIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  return forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined;
}
