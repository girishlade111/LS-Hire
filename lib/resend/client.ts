import { Resend } from "resend";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

let instance: Resend | null = null;

/** Lazy singleton — env validated on first use, not at import (build-safe). */
export function getResend(): Resend {
  if (!instance) {
    instance = new Resend(requireEnv("RESEND_API_KEY"));
  }
  return instance;
}
