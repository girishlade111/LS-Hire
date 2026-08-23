import { getGmailClientForUser } from "./client";
import { withRetry } from "../retry";

type SendGmailReplyParams = {
  refreshToken: string;
  to: string;
  subject: string;
  body: string;
  threadId: string;
  inReplyToMessageId?: string;
};

function buildRawMessage({
  to,
  subject,
  body,
  inReplyToMessageId
}: Omit<SendGmailReplyParams, "refreshToken" | "threadId">): string {
  const finalSubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;

  const lines = [
    `To: ${to}`,
    `Subject: ${finalSubject}`,
    "Content-Type: text/plain; charset=utf-8"
  ];

  if (inReplyToMessageId) {
    lines.push(`In-Reply-To: ${inReplyToMessageId}`);
    lines.push(`References: ${inReplyToMessageId}`);
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
