import { getGmailClientForUser } from "./client";
import { withRetry } from "../retry";

export async function getOrCreateLabelId(
  refreshToken: string,
  labelName: string
): Promise<string> {
  const gmail = getGmailClientForUser(refreshToken);

  const listResponse = await withRetry(
    () => gmail.users.labels.list({ userId: "me" }),
    { label: "gmail.labels.list" }
  );

  const existing = (listResponse.data.labels ?? []).find(
    (label) => label.name === labelName
  );
  if (existing?.id) {
    return existing.id;
  }

  const createResponse = await withRetry(
    () =>
      gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: labelName,
          labelListVisibility: "labelShow",
          messageListVisibility: "show"
        }
      }),
    { label: "gmail.labels.create" }
  );

  const createdId = createResponse.data.id;
  if (!createdId) {
    throw new Error(`Failed to create Gmail label "${labelName}"`);
  }
  return createdId;
}

/**
 * Marks a message with a label — this is the single source of truth for
 * dedupe. Called ONLY after a reply email has successfully sent, so failed
 * sends stay unprocessed and are naturally retried on the next cron run.
 */
export async function applyLabel(
  refreshToken: string,
  messageId: string,
  labelName: string
): Promise<void> {
  const gmail = getGmailClientForUser(refreshToken);
  const labelId = await getOrCreateLabelId(refreshToken, labelName);

  await withRetry(
    () =>
      gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: { addLabelIds: [labelId] }
      }),
    { label: "gmail.messages.modify" }
  );
}
