import { z } from "zod";
import {
  isValidGmailLabelName,
  parseEmailAddress
} from "./validation";

const MAX_PROMPT_LENGTH = 4_000;

const gmailLabelSchema = z.string().refine(isValidGmailLabelName, {
  message:
    "must be 1-100 characters with no quotes, backslashes, newlines, or leading/trailing spaces"
});

export const settingsUpdateSchema = z
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

export type SettingsUpdateBody = z.infer<typeof settingsUpdateSchema>;
