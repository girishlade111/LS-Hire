import { Resend } from "resend";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export const resend = new Resend(requireEnv("RESEND_API_KEY"));
