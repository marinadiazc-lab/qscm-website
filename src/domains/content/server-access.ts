import type { PostAccessViewer } from "./access";

export async function getPostAccessViewerForRequest(): Promise<PostAccessViewer> {
  return { kind: "anonymous" };
}
