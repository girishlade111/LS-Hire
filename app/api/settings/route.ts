import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import {
  getUserSettings,
  saveUserSettings,
  type UserSettings
} from "@/lib/redis/settings";
import {
  isValidGmailLabelName,
  parseEmailAddress
} from "@/lib/validation";

const MAX_PROMPT_LENGTH = 4_000;

// Label names end up inside Gmail search queries — restrict to safe values.
const gmailLabelSchema = z.string().refine(isValidGmailLabelName, {
  message:
    "must be 1-100 characters with no quotes, backslashes, newlines, or leading/trailing spaces"
});

const settingsUpdateSchema = z
  .object({
    replyMethod: z.enum(["gmail", "resend"]).optional(),
    jobLabelName: gmailLabelSchema.optional(),
    processedLabelName: gmailLabelSchema.optional(),
    hrPersonaPrompt: z.string().max(MAX_PROMPT_LENGTH).optional(),
    resendFromEmail: z
      .string()
      .refine((value) => parseEmailAddress(value) !== null, {
        message: "must be a valid email address"
      })
      .optional()
  })
  .strict();

type SettingsUpdateBody = Partial<UserSettings>;

async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

function unauthorizedResponse() {
  return NextResponse.json(
    { success: false, error: "Unauthorized" },
    { status: 401 }
  );
}

function internalErrorResponse() {
  return NextResponse.json(
    { success: false, error: "Internal error" },
    { status: 500 }
  );
}

export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const settings = await getUserSettings(userId);
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error("[api/settings][GET] failed:", error);
    return internalErrorResponse();
  }
}

async function handleUpdate(request: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = settingsUpdateSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      const message = issue
        ? issue.path.length > 0
          ? `${issue.path.join(".")}: ${issue.message}`
          : issue.message
        : "Invalid request body";
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 }
      );
    }

    const updatedSettings = await saveUserSettings(
      userId,
      parsed.data as SettingsUpdateBody
    );
    return NextResponse.json({ success: true, data: updatedSettings });
  } catch (error) {
    console.error("[api/settings][update] failed:", error);
    return internalErrorResponse();
  }
}

export { handleUpdate as POST, handleUpdate as PATCH };
