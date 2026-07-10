import type { Metadata } from "next";

import {
  AdminPageHeader,
  DisabledAdminButton,
  OperationalLogTable,
} from "../_components";
import { listOperationalLogs } from "@/src/domains/admin/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Logs",
  description: "Inspect webhook and audit logs.",
};

export default async function AdminLogsPage() {
  const logs = await listOperationalLogs();

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
