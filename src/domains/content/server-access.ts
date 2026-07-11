import type { PostAccessViewer } from "./access";
import { getCurrentAuthSession } from "../auth/server/runtime";
import { getLocalSubscriptionEntitlementForUser } from "../subscriptions/runtime";

export async function getPostAccessViewerForRequest(): Promise<PostAccessViewer> {
  const auth = await getCurrentAuthSession();

  if (!auth) {
    return { kind: "anonymous" };
  }

  const entitlement = await getLocalSubscriptionEntitlementForUser(auth.user);

  return {
    kind: "authenticated",
    isFreeSubscriber: entitlement.isFreeSubscriber,
    subscription: entitlement.subscription,
  };
}
