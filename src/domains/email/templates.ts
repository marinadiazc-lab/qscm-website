import type { EmailAddressWithName, EmailMessageContent } from "./types";

export type SiteEmailTemplateOptions = {
  siteName: string;
  siteUrl: string;
  supportEmail?: string;
};

export type MagicLinkEmailInput = SiteEmailTemplateOptions & {
  magicLinkUrl: string;
  expiresInMinutes: number;
};

export type ReceiptEmailInput = SiteEmailTemplateOptions & {
  recipientName?: string;
  planName: string;
  amountLabel: string;
  receiptUrl?: string;
};

export type SubscriptionUpdateEmailInput = SiteEmailTemplateOptions & {
  recipientName?: string;
  headline: string;
  body: string;
  manageUrl: string;
};

export type CommentNotificationEmailInput = SiteEmailTemplateOptions & {
  postTitle: string;
  postUrl: string;
  commenterName: string;
  excerpt: string;
};

export type ShareByEmailInput = SiteEmailTemplateOptions & {
  from?: EmailAddressWithName;
  postTitle: string;
  postUrl: string;
  note?: string;
};

export function buildMagicLinkEmail(input: MagicLinkEmailInput): EmailMessageContent {
  const expiration = `${input.expiresInMinutes} minute${input.expiresInMinutes === 1 ? "" : "s"}`;
  const subject = `Sign in to ${input.siteName}`;
  const text = [
    `Use this link to sign in to ${input.siteName}:`,
    input.magicLinkUrl,
    "",
    `This link expires in ${expiration}. If you did not request it, you can ignore this email.`,
  ].join("\n");

  return {
    subject,
    previewText: `Your ${input.siteName} sign-in link expires in ${expiration}.`,
    text,
    html: baseHtml(input, {
      preheader: `Your sign-in link expires in ${expiration}.`,
      title: subject,
      body: [
        `<p>Use the button below to sign in to ${escapeHtml(input.siteName)}.</p>`,
        cta("Sign in", input.magicLinkUrl),
        `<p class="muted">This link expires in ${expiration}. If you did not request it, you can ignore this email.</p>`,
      ].join(""),
    }),
  };
}

export function buildReceiptEmail(input: ReceiptEmailInput): EmailMessageContent {
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hi,";
  const receiptLine = input.receiptUrl ? `\nReceipt: ${input.receiptUrl}` : "";

  return {
    subject: `Your ${input.siteName} receipt`,
    previewText: `${input.amountLabel} for ${input.planName}`,
    text: `${greeting}\n\nThanks for supporting ${input.siteName}. We recorded ${input.amountLabel} for ${input.planName}.${receiptLine}`,
    html: baseHtml(input, {
      preheader: `${input.amountLabel} for ${input.planName}`,
      title: "Receipt",
      body: [
        `<p>${escapeHtml(greeting)}</p>`,
        `<p>Thanks for supporting ${escapeHtml(input.siteName)}. We recorded <strong>${escapeHtml(input.amountLabel)}</strong> for ${escapeHtml(input.planName)}.</p>`,
        input.receiptUrl ? cta("View receipt", input.receiptUrl) : "",
      ].join(""),
    }),
  };
}

export function buildSubscriptionUpdateEmail(
  input: SubscriptionUpdateEmailInput,
): EmailMessageContent {
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hi,";

  return {
    subject: input.headline,
    previewText: input.body,
    text: `${greeting}\n\n${input.body}\n\nManage your subscription: ${input.manageUrl}`,
    html: baseHtml(input, {
      preheader: input.body,
      title: input.headline,
      body: [
        `<p>${escapeHtml(greeting)}</p>`,
        `<p>${escapeHtml(input.body)}</p>`,
        cta("Manage subscription", input.manageUrl),
      ].join(""),
    }),
  };
}

export function buildCommentNotificationEmail(
  input: CommentNotificationEmailInput,
): EmailMessageContent {
  return {
    subject: `New comment on ${input.postTitle}`,
    previewText: `${input.commenterName}: ${input.excerpt}`,
    text: `${input.commenterName} commented on ${input.postTitle}:\n\n${input.excerpt}\n\nRead it: ${input.postUrl}`,
    html: baseHtml(input, {
      preheader: `${input.commenterName}: ${input.excerpt}`,
      title: `New comment on ${input.postTitle}`,
      body: [
        `<p><strong>${escapeHtml(input.commenterName)}</strong> commented:</p>`,
        `<blockquote>${escapeHtml(input.excerpt)}</blockquote>`,
        cta("Read the conversation", input.postUrl),
      ].join(""),
    }),
  };
}

export function buildShareByEmail(input: ShareByEmailInput): EmailMessageContent {
  const sender = input.from?.name ?? input.from?.email ?? "Someone";
  const note = input.note ? `\n\n${input.note}` : "";

  return {
    subject: `${sender} shared ${input.postTitle}`,
    previewText: input.note ?? `Read ${input.postTitle}`,
    text: `${sender} shared ${input.postTitle}.${note}\n\n${input.postUrl}`,
    html: baseHtml(input, {
      preheader: input.note ?? `Read ${input.postTitle}`,
      title: input.postTitle,
      body: [
        `<p>${escapeHtml(sender)} shared this with you.</p>`,
        input.note ? `<blockquote>${escapeHtml(input.note)}</blockquote>` : "",
        cta("Read post", input.postUrl),
      ].join(""),
    }),
  };
}

export function buildNewsletterPostEmail(input: {
  siteName: string;
  siteUrl: string;
  postTitle: string;
  postUrl: string;
  excerpt: string;
  subject?: string;
  previewText?: string;
  unsubscribeHint?: boolean;
}): EmailMessageContent {
  const subject = input.subject ?? input.postTitle;
  const unsubscribe = input.unsubscribeHint
    ? `<p class="muted">You can unsubscribe here: {{{RESEND_UNSUBSCRIBE_URL}}}</p>`
    : "";

  return {
    subject,
    previewText: input.previewText ?? input.excerpt,
    text: `${input.postTitle}\n\n${input.excerpt}\n\nRead the full post: ${input.postUrl}`,
    html: baseHtml(input, {
      preheader: input.previewText ?? input.excerpt,
      title: input.postTitle,
      body: [
        `<p>${escapeHtml(input.excerpt)}</p>`,
        cta("Read full post", input.postUrl),
        unsubscribe,
      ].join(""),
    }),
  };
}

function baseHtml(
  input: SiteEmailTemplateOptions,
  content: { preheader: string; title: string; body: string },
) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(content.title)}</title>
    <style>
      body { margin: 0; background: #f6f7f8; color: #182026; font-family: Arial, sans-serif; }
      .shell { max-width: 640px; margin: 0 auto; padding: 32px 20px; }
      .panel { background: #ffffff; border: 1px solid #dde2e6; padding: 28px; }
      h1 { font-size: 24px; line-height: 1.25; margin: 0 0 18px; }
      p { font-size: 16px; line-height: 1.6; }
      blockquote { border-left: 3px solid #96a1aa; margin: 20px 0; padding-left: 16px; color: #36424c; }
      .button { background: #17212b; color: #ffffff !important; display: inline-block; padding: 12px 18px; text-decoration: none; }
      .muted { color: #65717b; font-size: 13px; }
    </style>
  </head>
  <body>
    <span style="display:none">${escapeHtml(content.preheader)}</span>
    <div class="shell">
      <div class="panel">
        <p class="muted">${escapeHtml(input.siteName)}</p>
        <h1>${escapeHtml(content.title)}</h1>
        ${content.body}
        ${input.supportEmail ? `<p class="muted">Need help? Reply to ${escapeHtml(input.supportEmail)}.</p>` : ""}
      </div>
    </div>
  </body>
</html>`;
}

function cta(label: string, url: string) {
  return `<p><a class="button" href="${escapeHtml(url)}">${escapeHtml(label)}</a></p>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
