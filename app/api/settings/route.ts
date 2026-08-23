import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import {
  getUserSettings,
  saveUserSettings,
  type UserSettings
} from "@/lib/redis/settings";

const settingsUpdateSchema = z
  .object({
    replyMethod: z.enum(["gmail", "resend"]).optional(),
    jobLabelName: z.string().optional(),
    processedLabelName: z.string().optional(),
    hrPersonaPrompt: z.string().optional(),
    resendFromEmail: z.string().optional()
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

export async function POST(request: Request) {
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
    console.error("[api/settings][POST] failed:", error);
    return internalErrorResponse();
  }
}
