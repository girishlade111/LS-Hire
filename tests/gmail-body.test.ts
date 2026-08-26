import { describe, expect, it } from "vitest";
import type { gmail_v1 } from "googleapis";
import {
  decodePartText,
  extractBody,
  getHeader,
  hasAttachmentDeep,
  stripHtmlTags
} from "../lib/gmail/body";

type MessagePart = gmail_v1.Schema$MessagePart;

function part(partial: MessagePart): MessagePart {
  return partial;
}

function encodeBase64Url(text: string): string {
  return Buffer.from(text, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("decodePartText", () => {
  it("decodes base64url bodies containing - and _ characters", () => {
    // This payload's base64 form contains both '+' and '/' characters.
    const original = "Subject: résumé >>> ?? <<<??";
    expect(decodePartText(part({ body: { data: encodeBase64Url(original) } }))).toBe(
      original
    );
  });

  it("returns null for parts without body data", () => {
    expect(decodePartText(part({ mimeType: "text/plain" }))).toBeNull();
  });
});

describe("stripHtmlTags", () => {
  it("removes tags and collapses whitespace", () => {
    expect(stripHtmlTags("<p>Hello &nbsp; world</p>")).toBe("Hello world");
  });

  it("drops style and script blocks entirely", () => {
    const html = "<style>.x{color:red}</style><p>Body</p><script>alert(1)</script>";
    expect(stripHtmlTags(html)).toBe("Body");
  });

  it("decodes named and numeric entities without double-decoding ampersands", () => {
    expect(stripHtmlTags("<p>Fish &amp; Chips</p>")).toBe("Fish & Chips");
    expect(stripHtmlTags("5 &lt; 6 &gt; 4")).toBe("5 < 6 > 4");
  });

  it("leaves unknown entities untouched", () => {
    expect(stripHtmlTags("&fakeentity; ok")).toBe("&fakeentity; ok");
  });
});

describe("extractBody", () => {
  it("prefers text/plain over text/html", () => {
    const payload = part({
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/plain",
          body: { data: encodeBase64Url("plain body") }
        },
        {
          mimeType: "text/html",
          body: { data: encodeBase64Url("<b>html body</b>") }
        }
      ]
    });
    expect(extractBody(payload)).toBe("plain body");
  });

  it("falls back to html stripped of tags in nested structures", () => {
    const payload = part({
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            {
              mimeType: "text/html",
              body: { data: encodeBase64Url("<div>Nested<br/>HTML</div>") }
            }
          ]
        }
      ]
    });
    expect(extractBody(payload)).toContain("Nested");
    expect(extractBody(payload)).not.toContain("<div>");
  });

  it("returns empty string when neither format exists", () => {
    expect(extractBody(part({ mimeType: "text/plain" }))).toBe("");
  });
});

describe("hasAttachmentDeep", () => {
  it("detects attachments at any depth", () => {
    const payload = part({
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "text/plain", body: { data: "aGk=" } },
        {
          mimeType: "application/pdf",
          filename: "resume.pdf",
          body: { attachmentId: "att1" }
        }
      ]
    });
    expect(hasAttachmentDeep(payload)).toBe(true);
  });

  it("returns false without attachments", () => {
    expect(
      hasAttachmentDeep(
        part({ mimeType: "text/plain", body: { data: "aGk=" } })
      )
    ).toBe(false);
  });
});

describe("getHeader", () => {
  it("matches headers case-insensitively", () => {
    const payload = part({
      headers: [{ name: "SUBJECT", value: "Hello" }]
    });
    expect(getHeader(payload, "subject")).toBe("Hello");
  });

  it("returns empty string for missing headers", () => {
    expect(getHeader(part({}), "From")).toBe("");
  });
});
