import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual as nodeTimingSafeEqual
} from "crypto";

const ENCRYPTION_PREFIX = "enc:v1:";

function getKey(): Buffer {
  const secret =
    process.env.TOKEN_ENCRYPTION_KEY ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Missing env var: TOKEN_ENCRYPTION_KEY (or NEXTAUTH_SECRET) is required to encrypt stored credentials"
    );
  }
  return createHash("sha256").update(secret).digest();
}

/**
 * Compares two strings in constant time to prevent timing attacks on
 * shared secrets. Returns false when lengths differ.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    nodeTimingSafeEqual(bufA, bufA);
    return false;
  }
  return nodeTimingSafeEqual(bufA, bufB);
}

/** AES-256-GCM encrypt. Format: enc:v1:<iv>:<authTag>:<ciphertext> (base64url parts). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64url"),
    ":",
    authTag.toString("base64url"),
    ":",
    ciphertext.toString("base64url")
  ].join("");
}

/**
 * Decrypts values produced by encryptSecret. Values without the prefix are
 * returned as-is so tokens written by older versions keep working.
 */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(ENCRYPTION_PREFIX)) {
    return stored;
  }

  const parts = stored.slice(ENCRYPTION_PREFIX.length).split(":");
  const [ivPart, tagPart, dataPart] = parts;
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Malformed encrypted value");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final()
  ]).toString("utf-8");
}
