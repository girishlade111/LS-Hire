import type { gmail_v1 } from "googleapis";

type MessagePart = gmail_v1.Schema$MessagePart;

/**
 * Decodes a MIME part body. Gmail returns base64url-encoded bodies;
 * normalize to standard base64 before decoding so "-"/"_" characters are
 * not silently dropped.
 */
export function decodePartText(part: MessagePart): string | null {
  if (!part.body?.data) {
    return null;
  }
  const normalized = part.body.data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

function findDecodedText(part: MessagePart, mimeType: string): string | null {
  if (part.mimeType === mimeType && part.body?.data) {
    return decodePartText(part);
  }
  for (const child of part.parts ?? []) {
    const found = findDecodedText(child, mimeType);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

export function hasAttachmentDeep(part: MessagePart): boolean {
  if (part.filename && part.body?.attachmentId) {
    return true;
  }
  return (part.parts ?? []).some((child) => hasAttachmentDeep(child));
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'"
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        const code = parseInt(entity.slice(2), 16);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      if (entity.startsWith("#")) {
        const code = parseInt(entity.slice(1), 10);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    }
  );
}

export function stripHtmlTags(html: string): string {
  const withoutBlocks = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
  return decodeEntities(withoutBlocks.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function extractBody(payload: MessagePart): string {
  const plain = findDecodedText(payload, "text/plain");
  if (plain !== null) {
    return plain;
  }
  const html = findDecodedText(payload, "text/html");
  if (html !== null) {
    return stripHtmlTags(html);
  }
  return "";
}

export function getHeader(
  payload: MessagePart,
  name: string
): string {
  const header = (payload.headers ?? []).find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? "";
}
