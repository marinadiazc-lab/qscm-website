import type { Metadata } from "next";

import { AdminEmptyState, AdminPageHeader, MetricGrid } from "./_components";
import {
  getAdminPublication,
  getDashboardMetrics,
  listOperationalLogs,
} from "@/src/domains/admin/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Operational dashboard for QSCM.",
};

export default async function AdminDashboardPage() {
  const publication = await getAdminPublication();

  if (!publication) {
    return (
      <div className="stack">
        <AdminPageHeader
          title="Dashboard"
          description="The admin area is protected, but the QSCM publication has not been seeded yet."
        />
        <AdminEmptyState>Run the database seed before using operational tools.</AdminEmptyState>
      </div>
    );
  }

  const [metrics, logs] = await Promise.all([
    getDashboardMetrics(publication.id),
    listOperationalLogs(publication.id),
  ]);

  return (
    <div className="stack">
      <AdminPageHeader
        title="Dashboard"
        description={`Operational health for ${publication.name}. Posts remain file-authored in MDX.`}
      />
      <MetricGrid metrics={metrics} />
      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Recent Operations</h2>
        </div>
        {logs.length === 0 ? (
          <AdminEmptyState>No operational events have been recorded yet.</AdminEmptyState>
        ) : (
          <ul className="admin-log-list">
            {logs.slice(0, 6).map((log) => (
              <li key={`${log.kind}-${log.id}`}>
                <strong>{log.action}</strong>
                <span>
                  {log.kind} / {log.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
