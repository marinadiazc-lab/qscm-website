import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { getPostBySlug } from "@/src/content/posts";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  const slug = url.searchParams.get("slug");
  const configuredSecret = process.env.PREVIEW_SECRET;

  if (!configuredSecret || secret !== configuredSecret || !slug) {
    return new Response("Preview is unavailable.", { status: 401 });
  }

  const post = getPostBySlug(slug, { includeUnpublished: true });

  if (!post) {
    return new Response("Preview post not found.", { status: 404 });
  }

  (await draftMode()).enable();
  redirect(`/posts/${post.slug}`);
}
