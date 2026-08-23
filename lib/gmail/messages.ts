import type { gmail_v1 } from "googleapis";
import { getGmailClientForUser } from "./client";
import type { ParsedGmailMessage } from "./types";
import { withRetry } from "../retry";

type MessagePart = gmail_v1.Schema$MessagePart;

function findDecodedText(part: MessagePart, mimeType: string): string | null {
  if (part.mimeType === mimeType && part.body?.data) {
    return Buffer.from(part.body.data, "base64").toString("utf-8");
  }
  for (const child of part.parts ?? []) {
    const found = findDecodedText(child, mimeType);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

function hasAttachmentDeep(part: MessagePart): boolean {
  if (part.filename && part.body?.attachmentId) {
    return true;
  }
  return (part.parts ?? []).some((child) => hasAttachmentDeep(child));
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

function extractBody(payload: MessagePart): string {
  const plain = findDecodedText(payload, "text/plain");
  if (plain !== null) {
    return plain;
  }
  const html = findDecodedText(payload, "text/html");
  if (html !== null) {
    return stripHtmlTags(html);
  }
  return "";
}

function getHeader(payload: MessagePart, name: string): string {
  const header = (payload.headers ?? []).find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? "";
}

/**
 * Lists unprocessed application emails for one user.
 * Dedupe is entirely Gmail-label based: the search query excludes anything
 * already carrying the processed label, so no external tracking store exists.
 */
export async function listUnprocessedApplications(
  refreshToken: string,
  jobLabelName: string,
  processedLabelName: string
): Promise<ParsedGmailMessage[]> {
  const gmail = getGmailClientForUser(refreshToken);
  const query = `label:${jobLabelName} -label:${processedLabelName}`;

  const listResponse = await withRetry(
    () =>
      gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 20
      }),
    { label: "gmail.list" }
  );

  const messageList = listResponse.data.messages ?? [];
  if (messageList.length === 0) {
    return [];
  }

  const parsed: ParsedGmailMessage[] = [];

  for (const listItem of messageList) {
    const id = listItem.id;
    if (!id) {
      continue;
    }

    const response = await withRetry(
      () =>
        gmail.users.messages.get({
          userId: "me",
          id,
          format: "full"
        }),
      { label: "gmail.get" }
    );

    const message = response.data;
    const payload = message.payload ?? {};

    parsed.push({
      id,
      threadId: message.threadId ?? "",
      subject: getHeader(payload, "Subject"),
      fromHeader: getHeader(payload, "From"),
      bodyText: extractBody(payload),
      hasAttachment: hasAttachmentDeep(payload)
    });
  }

  return parsed;
}
