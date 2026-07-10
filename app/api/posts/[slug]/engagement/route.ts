import { NextResponse } from "next/server";
import { getEngagementService, getRequestEngagementContext } from "@/src/domains/engagement/runtime";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const { actor, actorCookie } = await getRequestEngagementContext();
  const service = await getEngagementService();
  const response = NextResponse.json(await service.getSummary(slug, actor));

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
