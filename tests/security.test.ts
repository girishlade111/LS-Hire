import { describe, it, expect } from "vitest";
import {
  safeCompare,
  encryptSecret,
  decryptSecret
} from "@/lib/security";

describe("safeCompare", () => {
  it("returns true for equal strings", () => {
    expect(safeCompare("Bearer abc", "Bearer abc")).toBe(true);
  });

  it("returns false for different content", () => {
    expect(safeCompare("Bearer abc", "Bearer abd")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(safeCompare("abc", "abcd")).toBe(false);
    expect(safeCompare("", "x")).toBe(false);
  });
});

describe("secret encryption", () => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-vitest";

  it("roundtrips a secret", () => {
    const plaintext = "1//abc-DEF_refresh_token_123";
    const encrypted = encryptSecret(plaintext);

    expect(encrypted).not.toContain(plaintext);
    expect(encrypted.startsWith("enc:v1:")).toBe(true);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("produces unique ciphertexts for identical input", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encryptSecret("secret-value");
    const head = encrypted.slice(0, encrypted.lastIndexOf(":") + 1);
    const tampered = `${head}${Buffer.from("tampered").toString("base64url")}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("throws on truncated ciphertext with prefix", () => {
    expect(() => decryptSecret("enc:v1:onlyonepart")).toThrow(
      "Malformed encrypted value"
    );
  });

  it("passes through legacy plaintext values unchanged", () => {
    expect(decryptSecret("legacy-plaintext-token")).toBe(
      "legacy-plaintext-token"
    );
  });

  it("rejects an empty secret key source", async () => {
    const saved = process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    try {
      expect(() => encryptSecret("x")).toThrow(/Missing env var/);
    } finally {
      process.env.NEXTAUTH_SECRET = saved;
    }
  });
});
