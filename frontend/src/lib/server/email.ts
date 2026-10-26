// Owner notification emails sent through the Resend REST API. Server-only:
// reads RESEND_API_KEY, which is never exposed to the browser.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const REQUEST_TIMEOUT_MS = 15_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailDeliveryError extends Error {}

function html(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function subjectText(value: unknown): string {
  return String(value ?? "").replace(/[\r\n]+/g, " ").split(/\s+/).filter(Boolean).join(" ").slice(0, 200);
}

export function isEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 320 && EMAIL_PATTERN.test(value);
}

function notificationRecipients(): string[] {
  return [
    ...new Set(
      (process.env.NOTIFICATION_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export type DetailRow = [label: string, value: unknown];

function detailRows(details: DetailRow[]): string {
  return details
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(
      ([label, value]) => `
                <tr>
                  <td style="padding:11px 0;border-bottom:1px solid #E7E5DF;color:#6B6B65;font-size:13px;vertical-align:top;width:36%;">${html(label)}</td>
                  <td style="padding:11px 0;border-bottom:1px solid #E7E5DF;color:#1C1C1A;font-size:14px;font-weight:600;vertical-align:top;">${html(value).replace(/\n/g, "<br />")}</td>
                </tr>`
    )
    .join("");
}

function messageBlock(label: string | undefined, message: unknown): string {
  if (!label || message === null || message === undefined || message === "") return "";
  return `
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;border-left:4px solid #729152;border-radius:10px;margin:24px 0;">
                <tr>
                  <td style="padding:20px 22px;">
                    <p style="margin:0 0 8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#729152;font-weight:700;">${html(label)}</p>
                    <p style="margin:0;font-size:14px;color:#1C1C1A;line-height:1.65;">${html(message).replace(/\n/g, "<br />")}</p>
                  </td>
                </tr>
              </table>`;
}

interface SubmissionNotification {
  title: string;
  eyebrow: string;
  intro: string;
  details: DetailRow[];
  subject: string;
  messageLabel?: string;
  message?: unknown;
  /** Customer address; owners can reply to the notification to reach them. */
  replyTo?: string | null;
}

/**
 * Sends a notification to NOTIFICATION_EMAILS. With no database, this email is
 * the only record of the submission, so delivery failures throw and the route
 * reports the failure to the customer instead of silently dropping it.
 */
export async function sendSubmissionNotification(notification: SubmissionNotification): Promise<void> {
  if (process.env.EMAIL_ENABLED === "false") {
    console.info("Email delivery disabled by configuration; skipping:", notification.subject);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const recipients = notificationRecipients();
  if (!apiKey || recipients.length === 0) {
    throw new EmailDeliveryError("Email is not configured: set RESEND_API_KEY and NOTIFICATION_EMAILS");
  }

  const fromEmail = process.env.FROM_EMAIL || "orders@lokucaters.com";
  const replyTo = isEmail(notification.replyTo) ? notification.replyTo : process.env.REPLY_TO_EMAIL || undefined;
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${html(notification.title)} - Loku Caters</title>
</head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 12px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(18,39,15,0.08);">
          <tr>
            <td style="background:#12270F;padding:34px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#729152;font-weight:700;">${html(notification.eyebrow)}</p>
              <h1 style="margin:9px 0 0;font-size:27px;font-weight:700;color:#F7F5F0;font-family:Georgia,serif;">${html(notification.title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:38px 40px 40px;">
              <p style="margin:0 0 24px;font-size:15px;color:#4A4A46;line-height:1.65;">${html(notification.intro)}</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0;">
                ${detailRows(notification.details)}
              </table>
              ${messageBlock(notification.messageLabel, notification.message)}
            </td>
          </tr>
          <tr>
            <td style="background:#12270F;padding:22px 40px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#729152;">Loku Caters - Internal Notification</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Loku Caters <${fromEmail}>`,
        to: recipients,
        subject: subjectText(notification.subject),
        html: body,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new EmailDeliveryError(`Resend request failed: ${(error as Error).message}`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new EmailDeliveryError(`Resend responded ${response.status}: ${detail.slice(0, 500)}`);
  }
}
