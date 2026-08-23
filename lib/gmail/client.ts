import { google } from "googleapis";

export const GMAIL_SCOPES: string[] = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.send"
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

/**
 * Builds a Gmail API client scoped to one connected user.
 *
 * Note: googleapis handles access-token refresh internally on each API call
 * using the provided refresh token — no manual expiry math needed.
 */
export function getGmailClientForUser(refreshToken: string) {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.gmail({ version: "v1", auth: oauth2Client });
}
