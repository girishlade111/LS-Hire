import { redis } from "./client";

export type ReplyMethod = "gmail" | "resend";

export interface UserSettings {
  replyMethod: ReplyMethod;
  jobLabelName: string;
  processedLabelName: string;
  hrPersonaPrompt: string;
  resendFromEmail?: string;
}

export const DEFAULTS: UserSettings = {
  replyMethod: "gmail",
  jobLabelName: "job-applications",
  processedLabelName: "auto-replied",
  hrPersonaPrompt:
    "You are a friendly, professional HR assistant replying to incoming job applications on behalf of the hiring team. Acknowledge each applicant warmly, thank them for their interest, keep replies concise and clear, maintain an encouraging tone, and never promise interviews, offers, or specific timelines."
};

const SETTINGS_KEY_PREFIX = "settings:";

function isReplyMethod(value: unknown): value is ReplyMethod {
  return value === "gmail" || value === "resend";
}

function normalize(raw: Record<string, string> | null): UserSettings {
  if (!raw) {
    return { ...DEFAULTS };
  }
  return {
    replyMethod: isReplyMethod(raw.replyMethod)
      ? raw.replyMethod
      : DEFAULTS.replyMethod,
    jobLabelName: raw.jobLabelName || DEFAULTS.jobLabelName,
    processedLabelName: raw.processedLabelName || DEFAULTS.processedLabelName,
    hrPersonaPrompt: raw.hrPersonaPrompt || DEFAULTS.hrPersonaPrompt,
    resendFromEmail: raw.resendFromEmail || undefined
  };
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const data = await redis.hgetall<Record<string, string>>(
    `${SETTINGS_KEY_PREFIX}${userId}`
  );
  return normalize(data);
}

export async function saveUserSettings(
  userId: string,
  partial: Partial<UserSettings>
): Promise<UserSettings> {
  const current = await getUserSettings(userId);
  const merged: UserSettings = { ...current, ...partial };
  await redis.hset(`${SETTINGS_KEY_PREFIX}${userId}`, merged);
  return merged;
}
