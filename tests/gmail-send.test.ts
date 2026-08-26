import { describe, it, expect } from "vitest";
import { buildRawMessage } from "@/lib/gmail/send";
import { parseEmailAddress } from "@/lib/validation";

const recipient = parseEmailAddress("jane@example.com")!;

describe("buildRawMessage", () => {
  it("builds headers with Re: prefix and threading fields", () => {
    const raw = buildRawMessage({
      to: recipient,
      subject: "Application for Backend Engineer",
      body: "Thanks for applying!",
      inReplyToMessageId: "<abc123@mail.gmail.com>"
    });

    expect(raw).toContain(`To: jane@example.com`);
    expect(raw).toContain("Subject: Re: Application for Backend Engineer");
    expect(raw).toContain("In-Reply-To: <abc123@mail.gmail.com>");
    expect(raw).toContain("References: <abc123@mail.gmail.com>");
    expect(raw.endsWith("\r\n\r\nThanks for applying!")).toBe(true);
  });

  it("does not double-prefix an existing Re: subject", () => {
    const raw = buildRawMessage({
      to: recipient,
      subject: "Re: Hello",
      body: "x"
    });
    expect(raw).not.toContain("Re: Re:");
  });

  it("strips CR/LF from the subject to prevent header injection", () => {
    const raw = buildRawMessage({
      to: recipient,
      subject: "Hi\r\nBcc: attacker@evil.com",
      body: "x"
    });
    // The injected text may remain inline but must never form a header line.
    expect(raw.match(/\r\nBcc:/)).toBeNull();
  });

  it("renders display-name recipients safely", () => {
    const named = parseEmailAddress("Jane Doe <jane@example.com>")!;
    const raw = buildRawMessage({ to: named, subject: "S", body: "b" });
    expect(raw).toContain("To: Jane Doe <jane@example.com>");
  });

  it("omits threading headers when RFC Message-ID is absent", () => {
    const raw = buildRawMessage({ to: recipient, subject: "S", body: "x" });
    expect(raw).not.toContain("In-Reply-To");
    expect(raw).not.toContain("References");
  });
});
