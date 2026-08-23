import { NextResponse } from "next/server";
import { getUserToken, listActiveUserIds } from "@/lib/redis/tokens";
import { getUserSettings, type UserSettings } from "@/lib/redis/settings";
import { listUnprocessedApplications } from "@/lib/gmail/messages";
import type { ParsedGmailMessage } from "@/lib/gmail/types";
import { applyLabel } from "@/lib/gmail/labels";
import { sendGmailReply } from "@/lib/gmail/send";
import { sendResendReply } from "@/lib/resend/send";
import { analyzeJobApplication } from "@/lib/ai/analyze";

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
    return {
      userId,
      messageId: message.id,
      status: "skipped",
      detail: "candidate email not found, left unlabeled for manual review"
    };
  }

  if (settings.replyMethod === "resend") {
    const fromEmail = settings.resendFromEmail ?? process.env.RESEND_FROM_EMAIL;
    if (!fromEmail) {
      throw new Error(
        "reply method is resend but no sender email is configured (set resendFromEmail in settings or RESEND_FROM_EMAIL env var)"
      );
    }
    await sendResendReply({
      to: analysis.candidateEmail,
      subject: analysis.replySubject,
      body: analysis.replyBody,
      fromEmail
    });
  } else {
    await sendGmailReply({
      refreshToken,
      to: analysis.candidateEmail,
      subject: analysis.replySubject,
      body: analysis.replyBody,
      threadId: message.threadId,
      inReplyToMessageId: message.id
    });
  }

  await applyLabel(refreshToken, message.id, settings.processedLabelName);

  return {
    userId,
    messageId: message.id,
    status: "sent",
    detail: `replied to ${analysis.candidateEmail}`
  };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
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
        try {
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
        }
      }
    } catch (userError) {
      console.error(`[cron/poll] failed processing user ${userId}:`, userError);
    }
  }

  return NextResponse.json({
    success: true,
    processedCount: results.length,
    results
  });
}
