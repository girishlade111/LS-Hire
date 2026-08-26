import type { gmail_v1 } from "googleapis";
import { getGmailClientForUser } from "./client";
import type { ParsedGmailMessage } from "./types";
import { withRetry } from "../retry";
import { gmailLabelQueryTerm } from "../validation";
import {
  extractBody,
  getHeader,
  hasAttachmentDeep
} from "./body";

type MessagePart = gmail_v1.Schema$MessagePart;

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
  // Label names are user-configured; quoting prevents query injection.
  const query = `${gmailLabelQueryTerm(jobLabelName)} -${gmailLabelQueryTerm(processedLabelName)}`;

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
    const payload: MessagePart = message.payload ?? {};

    parsed.push({
      id,
      threadId: message.threadId ?? "",
      subject: getHeader(payload, "Subject"),
      fromHeader: getHeader(payload, "From"),
      rfcMessageId: getHeader(payload, "Message-ID"),
      bodyText: extractBody(payload),
      hasAttachment: hasAttachmentDeep(payload)
    });
  }

  return parsed;
}

export interface ProcessedApplicationRow {
  id: string;
  subject: string;
  from: string;
}

/**
 * Lists recently processed (auto-replied) application emails using a cheap
 * metadata-only fetch. Used by the dashboard.
 */
export async function listProcessedApplications(
  refreshToken: string,
  processedLabelName: string,
  maxResults = 20
): Promise<ProcessedApplicationRow[]> {
  const gmail = getGmailClientForUser(refreshToken);

  const listResponse = await withRetry(
    () =>
      gmail.users.messages.list({
        userId: "me",
        q: gmailLabelQueryTerm(processedLabelName),
        maxResults
      }),
    { label: "gmail.list" }
  );

  const rows: ProcessedApplicationRow[] = [];

  for (const item of listResponse.data.messages ?? []) {
    const id = item.id;
    if (!id) {
      continue;
    }
    try {
      const response = await withRetry(
        () =>
          gmail.users.messages.get({
            userId: "me",
            id,
            format: "metadata",
            metadataHeaders: ["Subject", "From"]
          }),
        { label: "gmail.get" }
      );
      const headers = response.data.payload?.headers ?? [];
      const headerValue = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
          ?.value ?? "";
      rows.push({
        id,
        subject: headerValue("Subject") || "(no subject)",
        from: headerValue("From") || "unknown sender"
      });
    } catch (error) {
      console.error(`[gmail/messages] failed to fetch message ${id}:`, error);
    }
  }

  return rows;
}
