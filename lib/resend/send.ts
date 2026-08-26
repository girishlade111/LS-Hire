import { getResend } from "./client";
import { withRetry } from "../retry";
import type { ParsedEmail } from "../validation";

type SendResendReplyParams = {
  /** Pre-validated recipient produced by parseEmailAddress. */
  to: ParsedEmail;
  subject: string;
  body: string;
  fromEmail: string;
};

export async function sendResendReply(
  params: SendResendReplyParams
): Promise<void> {
  const resend = getResend();

  // Resend returns API errors in-band ({ error }) instead of throwing, so the
  // throw must happen INSIDE withRetry for transient failures to be retried.
  await withRetry(
    async () => {
      const response = await resend.emails.send({
        from: params.fromEmail,
        to: params.to.address,
        subject: params.subject,
        text: params.body
      });
      if (response.error) {
        const error = new Error(
          `Resend send failed (${response.error.name}): ${response.error.message}`
        );
        // Attach a status so withRetry can classify retryability. Rate-limit
        // and server-side failures are retried; client mistakes are not.
        (error as Error & { status?: number }).status =
          response.error.name === "rate_limit_exceeded" ? 429 : undefined;
        if (response.error.name === "internal_server_error") {
          (error as Error & { status?: number }).status = 503;
        }
        throw error;
      }
      return response.data;
    },
    { label: "resend.send" }
  );
}
