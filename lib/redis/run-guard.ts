import { getRedis } from "./client";

const LOCK_TTL_SECONDS = 300;
const SENT_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * Distributed per-message lock so overlapping cron runs never process the
 * same message concurrently (which would send duplicate replies).
 */
export async function acquireMessageLock(messageId: string): Promise<boolean> {
  const result: unknown = await getRedis().set(`lock:msg:${messageId}`, "1", {
    nx: true,
    ex: LOCK_TTL_SECONDS
  });
  // Upstash REST returns "OK"; the Node SDK may surface true.
  return result === "OK" || result === true;
}

export async function releaseMessageLock(messageId: string): Promise<void> {
  await getRedis().del(`lock:msg:${messageId}`);
}

/**
 * Idempotency marker written immediately after a successful reply send,
 * before the Gmail label is applied — closes the window where a crash or
 * failed labeling would cause a resend on the next run.
 */
export async function wasAlreadyReplied(
  userId: string,
  messageId: string
): Promise<boolean> {
  const value = await getRedis().get(`sent:${userId}:${messageId}`);
  return value !== null && value !== undefined;
}

export async function markReplied(
  userId: string,
  messageId: string
): Promise<void> {
  await getRedis().set(`sent:${userId}:${messageId}`, Date.now(), {
    ex: SENT_TTL_SECONDS
  });
}
