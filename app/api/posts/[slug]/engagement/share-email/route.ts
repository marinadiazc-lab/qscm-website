import { NextResponse } from "next/server";
import { getPostBySlug } from "@/src/content/posts";
import {
  createNoopEmailProvider,
  getEngagementService,
  getRequestEngagementContext,
} from "@/src/domains/engagement/runtime";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const post = getPostBySlug(slug);
  const body = await request.json().catch(() => ({}));
  const { actor, actorCookie, requestContext } = await getRequestEngagementContext();
  const service = await getEngagementService();
  const origin = new URL(request.url).origin;
  const result = await service.sharePostByEmail({
    postSlug: slug,
    recipientEmail: String(body.email ?? body.recipientEmail ?? ""),
    senderName: body.name ? String(body.name) : undefined,
    honeypot: body.company ? String(body.company) : undefined,
    postTitle: post?.title ?? slug,
    postUrl: post?.canonicalUrl ?? `${origin}/posts/${slug}`,
    actor,
    requestContext,
    emailProvider: createNoopEmailProvider(),
    publicationId: post?.publicationId,
  });
  const response = NextResponse.json(result, {
    status: result.ok ? 200 : result.status === "rate_limited" ? 429 : 400,
  });

  if (actorCookie) {
    response.cookies.set(actorCookie.name, actorCookie.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}
