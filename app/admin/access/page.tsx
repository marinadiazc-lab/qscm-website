import type { Metadata } from "next";

import {
  AccessGrantTable,
  AdminEmptyState,
  AdminPageHeader,
  DisabledAdminButton,
} from "../_components";
import { getAdminPublication, listAccessGrants } from "@/src/domains/admin/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Access",
  description: "Inspect local access grants.",
};

export default async function AdminAccessPage() {
  const publication = await getAdminPublication();

  if (!publication) {
    return (
      <div className="stack">
        <AdminPageHeader title="Access" description="Access tools need a seeded publication." />
        <AdminEmptyState>No publication is available.</AdminEmptyState>
      </div>
    );
  }

  const grants = await listAccessGrants(publication.id);

  return (
    <div className="stack">
      <AdminPageHeader
        title="Access Grants"
        description="Inspect subscription, gift, migration, and admin-comped entitlement grants."
        action={<DisabledAdminButton>Grant Access</DisabledAdminButton>}
      />
      <AccessGrantTable grants={grants} />
    </div>
  );
}
