import type { Metadata } from "next";

import { requireAdminPageAccess } from "../_access";
import {
  AdminEmptyState,
  AdminPageHeader,
  DisabledAdminButton,
  OperationalLogTable,
} from "../_components";
import {
  getAdminPublication,
  listOperationalLogs,
} from "@/src/domains/admin/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Logs",
  description: "Inspect webhook and audit logs.",
};

export default async function AdminLogsPage() {
  await requireAdminPageAccess();

  const publication = await getAdminPublication();

  if (!publication) {
    return (
      <div className="stack">
        <AdminPageHeader
          title="Operational Logs"
          description="Webhook and audit log inspection with redacted details for admin review."
        />
        <AdminEmptyState>Run the database seed before using operational tools.</AdminEmptyState>
      </div>
    );
  }

  const logs = await listOperationalLogs(publication.id);

  return (
    <div className="stack">
      <AdminPageHeader
        title="Operational Logs"
        description="Webhook and audit log inspection with redacted details for admin review."
        action={<DisabledAdminButton>Retry Selected</DisabledAdminButton>}
      />
      <OperationalLogTable logs={logs} />
    </div>
  );
}
