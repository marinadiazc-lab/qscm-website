import Link from "next/link";
import type { ReactNode } from "react";

import type {
  AdminAccessGrantRow,
  AdminCommentRow,
  AdminMediaRow,
  AdminMetric,
  AdminOperationalLogRow,
  AdminPodcastShowRow,
  AdminSubscriberRow,
  AdminTierRow,
} from "@/src/domains/admin/dashboard";

export function AdminPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-page-header">
      <div>
        <p className="eyebrow">Admin</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

export function AdminEmptyState({ children }: { children: ReactNode }) {
  return <div className="admin-empty">{children}</div>;
}

export function DisabledAdminButton({ children }: { children: ReactNode }) {
  return (
    <button className="secondary-button admin-disabled-button" type="button" disabled>
      {children}
    </button>
  );
}

export function MetricGrid({ metrics }: { metrics: AdminMetric[] }) {
  return (
    <section className="admin-metric-grid" aria-label="Dashboard metrics">
      {metrics.map((metric) => (
        <article className="admin-metric" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <p>{metric.detail}</p>
        </article>
      ))}
    </section>
  );
}

export function SubscriberTable({ subscribers }: { subscribers: AdminSubscriberRow[] }) {
  if (subscribers.length === 0) {
    return <AdminEmptyState>No subscribers match this view.</AdminEmptyState>;
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Status</th>
            <th>Account</th>
            <th>Subscription</th>
            <th>Billing</th>
            <th>Email sync</th>
            <th>Comments</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {subscribers.map((subscriber) => (
            <tr key={subscriber.id}>
              <td>
                <strong>{subscriber.email}</strong>
                <span className="admin-cell-note">{subscriber.name || subscriber.source}</span>
              </td>
              <td>{subscriber.status}</td>
              <td>{subscriber.userId ? "Linked" : "Email only"}</td>
              <td>{subscriber.subscriptionSummary}</td>
              <td>{subscriber.billingSummary}</td>
              <td>{subscriber.syncSummary}</td>
              <td>{subscriber.commentCount}</td>
              <td>{formatDate(subscriber.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TierTable({ tiers }: { tiers: AdminTierRow[] }) {
  if (tiers.length === 0) {
    return <AdminEmptyState>No tiers have been seeded for this publication.</AdminEmptyState>;
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Status</th>
            <th>Entitlements</th>
            <th>Prices</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier) => (
            <tr key={tier.id}>
              <td>
                <strong>{tier.name}</strong>
                <span className="admin-cell-note">{tier.description || tier.slug}</span>
                <span className="admin-cell-note">
                  {tier.providerProductId ? `${tier.provider}: ${tier.providerProductId}` : "No provider product"}
                </span>
              </td>
              <td>{tier.status}</td>
              <td>{tier.entitlementKeys.join(", ") || "None"}</td>
              <td>
                {tier.prices.length > 0
                  ? tier.prices.map((price) => (
                      <span className="admin-price-line" key={price.id}>
                        {price.interval}: {formatCurrency(price.amountCents, price.currency)}{" "}
                        {price.activeForCheckout ? "enabled" : "disabled"}
                      </span>
                    ))
                  : "No prices"}
              </td>
              <td>
                <DisabledAdminButton>Edit</DisabledAdminButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AccessGrantTable({ grants }: { grants: AdminAccessGrantRow[] }) {
  if (grants.length === 0) {
    return <AdminEmptyState>No access grants exist yet.</AdminEmptyState>;
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Entitlement</th>
            <th>Source</th>
            <th>Window</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {grants.map((grant) => (
            <tr key={grant.id}>
              <td>
                <strong>{grant.subject}</strong>
                <span className="admin-cell-note">{grant.tierName || "Direct grant"}</span>
              </td>
              <td>{grant.entitlementKey}</td>
              <td>{grant.source}</td>
              <td>
                {formatDate(grant.startsAt)} to {grant.endsAt ? formatDate(grant.endsAt) : "open"}
              </td>
              <td>{grant.revokedAt ? `Revoked ${formatDate(grant.revokedAt)}` : "Active"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CommentTable({
  comments,
  publicationId,
  returnTo = "/admin/comments",
}: {
  comments: AdminCommentRow[];
  publicationId?: string;
  returnTo?: string;
}) {
  if (comments.length === 0) {
    return <AdminEmptyState>No comments are waiting in this queue.</AdminEmptyState>;
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Comment</th>
            <th>Author</th>
            <th>Status</th>
            <th>Audit</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {comments.map((comment) => (
            <tr key={comment.id}>
              <td>
                <strong>{comment.postSlug}</strong>
                <span className="admin-cell-note">{truncate(comment.body, 140)}</span>
              </td>
              <td>
                {comment.author}
                <PrivateCommentField label="email" value={comment.email} />
                <PrivateCommentField label="website" value={comment.website} />
                <PrivateCommentField
                  label="registered user"
                  value={comment.registeredUserId}
                />
              </td>
              <td>{comment.status}</td>
              <td>{comment.auditCount} checks</td>
              <td>
                {publicationId ? (
                  <div className="admin-action-row">
                    <ModerationActionForm
                      action="approve"
                      commentId={comment.id}
                      label="Approve"
                      publicationId={publicationId}
                      returnTo={returnTo}
                    />
                    <ModerationActionForm
                      action="reject"
                      commentId={comment.id}
                      label="Reject"
                      publicationId={publicationId}
                      returnTo={returnTo}
                    />
                    <ModerationActionForm
                      action="delete"
                      commentId={comment.id}
                      label="Delete"
                      publicationId={publicationId}
                      returnTo={returnTo}
                    />
                  </div>
                ) : (
                  <DisabledAdminButton>Unavailable</DisabledAdminButton>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrivateCommentField({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }

  return (
    <span className="admin-cell-note admin-private-field">
      Private {label}: {value}
    </span>
  );
}

function ModerationActionForm({
  action,
  commentId,
  label,
  publicationId,
  returnTo,
}: {
  action: "approve" | "reject" | "delete";
  commentId: string;
  label: string;
  publicationId: string;
  returnTo: string;
}) {
  return (
    <form
      action={`/api/admin/comments/${commentId}/moderation`}
      className="admin-action-form"
      method="post"
    >
      <input name="publicationId" type="hidden" value={publicationId} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <button
        className={action === "approve" ? "button" : "secondary-button"}
        name="action"
        type="submit"
        value={action}
      >
        {label}
      </button>
    </form>
  );
}

export function MediaTable({ media }: { media: AdminMediaRow[] }) {
  if (media.length === 0) {
    return <AdminEmptyState>No media assets are registered yet.</AdminEmptyState>;
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Kind</th>
            <th>Status</th>
            <th>Provider</th>
            <th>Metadata</th>
          </tr>
        </thead>
        <tbody>
          {media.map((asset) => (
            <tr key={asset.id}>
              <td>
                <strong>{asset.objectKey}</strong>
                {asset.publicUrl ? (
                  <Link className="admin-cell-note" href={asset.publicUrl}>
                    {asset.publicUrl}
                  </Link>
                ) : (
                  <span className="admin-cell-note">No public URL</span>
                )}
              </td>
              <td>{asset.kind}</td>
              <td>{asset.status}</td>
              <td>{asset.provider}</td>
              <td>
                {asset.mimeType || "Unknown type"}
                <span className="admin-cell-note">{formatBytes(asset.byteLength)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PodcastTable({ shows }: { shows: AdminPodcastShowRow[] }) {
  if (shows.length === 0) {
    return <AdminEmptyState>No podcast shows are configured yet.</AdminEmptyState>;
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Show</th>
            <th>Status</th>
            <th>Episodes</th>
            <th>Private tokens</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {shows.map((show) => (
            <tr key={show.id}>
              <td>
                <strong>{show.title}</strong>
                <span className="admin-cell-note">{show.slug}</span>
              </td>
              <td>{show.status}</td>
              <td>
                {show.publishedEpisodeCount} published / {show.episodeCount} total
              </td>
              <td>{show.tokenCount}</td>
              <td>{formatDate(show.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OperationalLogTable({ logs }: { logs: AdminOperationalLogRow[] }) {
  if (logs.length === 0) {
    return <AdminEmptyState>No audit or webhook log rows exist yet.</AdminEmptyState>;
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Kind</th>
            <th>Action</th>
            <th>Subject</th>
            <th>Status</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={`${log.kind}-${log.id}`}>
              <td>{formatDate(log.occurredAt)}</td>
              <td>{log.kind}</td>
              <td>{log.action}</td>
              <td>{log.subject}</td>
              <td>{log.status}</td>
              <td>{truncate(log.detail, 120)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCurrency(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatBytes(value: number | undefined) {
  if (!value) {
    return "No size recorded";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}
