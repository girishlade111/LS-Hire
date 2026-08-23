import { getResend } from "./client";
import { withRetry } from "../retry";

type SendResendReplyParams = {
  to: string;
  subject: string;
  body: string;
  fromEmail: string;
};

export async function sendResendReply(
  params: SendResendReplyParams
): Promise<void> {
  const resend = getResend();
  const response = await withRetry(
    () =>
      resend.emails.send({
        from: params.fromEmail,
        to: params.to,
        subject: params.subject,
        text: params.body
      }),
    { label: "resend.send" }
  );

  if (response.error) {
    throw new Error(
      `Resend send failed (${response.error.name}): ${response.error.message}`
    );
  }
}
