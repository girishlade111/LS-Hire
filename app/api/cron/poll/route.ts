import { NextResponse } from "next/server";
import { getUserToken, listActiveUserIds } from "@/lib/redis/tokens";
import { getUserSettings, type UserSettings } from "@/lib/redis/settings";
import {
  acquireMessageLock,
  releaseMessageLock,
  wasAlreadyReplied,
  markReplied
} from "@/lib/redis/run-guard";
import { listUnprocessedApplications } from "@/lib/gmail/messages";
import type { ParsedGmailMessage } from "@/lib/gmail/types";
import { applyLabel } from "@/lib/gmail/labels";
import { sendGmailReply } from "@/lib/gmail/send";
import { sendResendReply } from "@/lib/resend/send";
import { analyzeJobApplication } from "@/lib/ai/analyze";
import { parseEmailAddress } from "@/lib/validation";
import { safeCompare } from "@/lib/security";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PollResultStatus = "sent" | "skipped" | "error";

type PollResult = {
  userId: string;
  messageId: string;
  status: PollResultStatus;
  detail: string;
};

type ProcessMessageParams = {
  userId: string;
  refreshToken: string;
  settings: UserSettings;
  companyName: string;
  message: ParsedGmailMessage;
};

function skipped(
  userId: string,
  messageId: string,
  detail: string
): PollResult {
  return { userId, messageId, status: "skipped", detail };
}

async function processMessage({
  userId,
  refreshToken,
  settings,
  companyName,
  message
}: ProcessMessageParams): Promise<PollResult> {
  const analysis = await analyzeJobApplication({
    companyName,
    hrPersonaPrompt: settings.hrPersonaPrompt,
    subject: message.subject,
    bodyText: message.bodyText
  });

  if (!analysis.isJobApplication) {
    await applyLabel(refreshToken, message.id, settings.processedLabelName);
    return {
      userId,
      messageId: message.id,
      status: "skipped",
      detail: "not a job application, labeled as processed"
    };
  }

  if (!analysis.candidateEmail) {
    console.warn(
      `[cron/poll] job application ${message.id} for user ${userId} has no extractable candidate email, leaving unlabeled for manual review`
    );
    return skipped(
      userId,
      message.id,
      "candidate email not found, left unlabeled for manual review"
    );
  }

  // The candidate email is model-extracted from untrusted content — it must
  // be strictly validated before it is used as an email header/recipient.
  const recipient = parseEmailAddress(analysis.candidateEmail);
  if (!recipient) {
    console.warn(
      `[cron/poll] job application ${message.id} for user ${userId} has an invalid candidate email, leaving unlabeled for manual review`
    );
    return skipped(
      userId,
      message.id,
      "candidate email invalid, left unlabeled for manual review"
    );
  }

  if (settings.replyMethod === "resend") {
    const fromEmail = settings.resendFromEmail ?? process.env.RESEND_FROM_EMAIL;
    if (!fromEmail) {
      throw new Error(
        "reply method is resend but no sender email is configured (set resendFromEmail in settings or RESEND_FROM_EMAIL env var)"
      );
    }
    await sendResendReply({
      to: recipient,
      subject: analysis.replySubject,
      body: analysis.replyBody,
      fromEmail
    });
  } else {
    await sendGmailReply({
      refreshToken,
      to: recipient,
      subject: analysis.replySubject,
      body: analysis.replyBody,
      threadId: message.threadId,
      // RFC 822 Message-ID is required for client-side threading; Gmail's
      // internal API id is NOT a valid value, so omit it when absent.
      inReplyToMessageId: message.rfcMessageId || undefined
    });
  }

  // Mark replied BEFORE labeling so a crash in between cannot cause a
  // duplicate reply on the next cron run.
  await markReplied(userId, message.id);

  try {
    await applyLabel(refreshToken, message.id, settings.processedLabelName);
  } catch (labelError) {
    // The reply already went out; idempotency marker prevents a resend.
    console.error(
      `[cron/poll] reply sent but failed to label message ${message.id} for user ${userId}:`,
      labelError
    );
    return {
      userId,
      messageId: message.id,
      status: "error",
      detail:
        "reply sent but processing label could not be applied — manual verification recommended"
    };
  }

  return {
    userId,
    messageId: message.id,
    status: "sent",
    detail: `replied to ${recipient.address}`
  };
}

export async function GET(request: Request) {
  // Constant-time comparison prevents timing attacks on the cron secret.
  if (
    !process.env.CRON_SECRET ||
    !safeCompare(
      request.headers.get("authorization") ?? "",
      `Bearer ${process.env.CRON_SECRET}`
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyName = process.env.COMPANY_NAME ?? "Our Company";

  let userIds: string[];
  try {
    userIds = await listActiveUserIds();
  } catch (error) {
    console.error("[cron/poll] failed to list active users:", error);
    return NextResponse.json(
      { success: false, error: "failed to list active users" },
      { status: 500 }
    );
  }

  const results: PollResult[] = [];

  for (const userId of userIds) {
    try {
      const stored = await getUserToken(userId);
      if (!stored) {
        continue;
      }

      const settings = await getUserSettings(userId);

      const messages = await listUnprocessedApplications(
        stored.refreshToken,
        settings.jobLabelName,
        settings.processedLabelName
      );

      for (const message of messages) {
        // Distributed lock: overlapping cron runs must never process the
        // same message concurrently or the applicant gets duplicate replies.
        const locked = await acquireMessageLock(message.id);
        if (!locked) {
          results.push(skipped(userId, message.id, "locked by another run"));
          continue;
        }

        try {
          // Idempotency marker closes the send-vs-label crash window.
          if (await wasAlreadyReplied(userId, message.id)) {
            try {
              await applyLabel(
                stored.refreshToken,
                message.id,
                settings.processedLabelName
              );
            } catch (labelError) {
              console.error(
                `[cron/poll] failed to backfill label on already-replied message ${message.id}:`,
                labelError
              );
            }
            results.push(skipped(userId, message.id, "already replied"));
            continue;
          }

          const result = await processMessage({
            userId,
            refreshToken: stored.refreshToken,
            settings,
            companyName,
            message
          });
          results.push(result);
        } catch (messageError) {
          console.error(
            `[cron/poll] failed processing message ${message.id} for user ${userId}:`,
            messageError
          );
          results.push({
            userId,
            messageId: message.id,
            status: "error",
            detail:
              messageError instanceof Error
                ? messageError.message
                : String(messageError)
          });
        } finally {
          await releaseMessageLock(message.id).catch(() => undefined);
        }
      }
    } catch (userError) {
      console.error(`[cron/poll] failed processing user ${userId}:`, userError);
    }
  }

  return NextResponse.json({
    success: true,
    processedCount: results.filter((result) => result.status === "sent").length,
    results
  });
}
