import { getGmailClientForUser } from "./client";
import { withRetry } from "../retry";
import { parseEmailAddress, sanitizeHeaderValue, type ParsedEmail } from "../validation";

type SendGmailReplyParams = {
  refreshToken: string;
  /** Pre-validated recipient produced by parseEmailAddress. */
  to: ParsedEmail;
  subject: string;
  body: string;
  threadId: string;
  inReplyToMessageId?: string;
};

/** Builds the RFC 2822 raw message. Exported for testing. */
export function buildRawMessage({
  to,
  subject,
  body,
  inReplyToMessageId
}: Omit<SendGmailReplyParams, "refreshToken" | "threadId">): string {
  const finalSubject = /^re:/i.test(sanitizeHeaderValue(subject))
    ? sanitizeHeaderValue(subject)
    : `Re: ${sanitizeHeaderValue(subject)}`;

  const lines = [
    // From is required for strict RFC 2822 conformance; Gmail fills the
    // authenticated address when omitted, but explicit is safer.
    "From: me",
    `To: ${to.name ? `${to.name} <${to.address}>` : to.address}`,
    `Subject: ${finalSubject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit"
  ];

  if (inReplyToMessageId) {
    const safeMessageId = sanitizeHeaderValue(inReplyToMessageId);
    lines.push(`In-Reply-To: ${safeMessageId}`);
    lines.push(`References: ${safeMessageId}`);
  }

  return `${lines.join("\r\n")}\r\n\r\n${body}`;
}

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendGmailReply(
  params: SendGmailReplyParams
): Promise<void> {
  const gmail = getGmailClientForUser(params.refreshToken);
  const raw = toBase64Url(buildRawMessage(params));

  await withRetry(
    () =>
      gmail.users.messages.send({
        userId: "me",
        requestBody: { raw, threadId: params.threadId }
      }),
    { label: "gmail.send" }
  );
}
