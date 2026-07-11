import type { Metadata } from "next";

import {
  AdminEmptyState,
  AdminPageHeader,
  DisabledAdminButton,
  TierTable,
} from "../_components";
import { getAdminPublication, listAdminTiers } from "@/src/domains/admin/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Tiers",
  description: "Inspect tier and price configuration.",
};

export default async function AdminTiersPage() {
  const publication = await getAdminPublication();

  if (!publication) {
    return (
      <div className="stack">
        <AdminPageHeader title="Tiers" description="Tier tools need a seeded publication." />
        <AdminEmptyState>No publication is available.</AdminEmptyState>
      </div>
    );
  }

  const tiers = await listAdminTiers(publication.id);

  return (
    <div className="stack">
      <AdminPageHeader
        title="Tiers"
        description="Review tier entitlements, monthly and annual prices, and checkout enablement."
        action={<DisabledAdminButton>New Tier</DisabledAdminButton>}
      />
      <TierTable tiers={tiers} />
    </div>
  );
}
