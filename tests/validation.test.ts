import { describe, it, expect } from "vitest";
import {
  parseEmailAddress,
  sanitizeHeaderValue,
  isValidGmailLabelName,
  gmailLabelQueryTerm
} from "@/lib/validation";

describe("parseEmailAddress", () => {
  it("parses bare addresses", () => {
    expect(parseEmailAddress("jane.doe@example.com")).toEqual({
      address: "jane.doe@example.com",
      name: null
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseEmailAddress("  jane@example.com  ")?.address).toBe(
      "jane@example.com"
    );
  });

  it("parses display-name form", () => {
    expect(parseEmailAddress("Jane Doe <jane@example.com>")).toEqual({
      address: "jane@example.com",
      name: "Jane Doe"
    });
  });

  it("rejects header-injection payloads", () => {
    expect(parseEmailAddress("a@b.com\r\nBcc: evil@evil.com")).toBeNull();
    expect(parseEmailAddress("a@b.com\nSubject: x")).toBeNull();
  });

  it("rejects malformed addresses", () => {
    expect(parseEmailAddress("no-at-sign")).toBeNull();
    expect(parseEmailAddress("@nodomain")).toBeNull();
    expect(parseEmailAddress("user@")).toBeNull();
    expect(parseEmailAddress("")).toBeNull();
    expect(parseEmailAddress("a".repeat(330) + "@example.com")).toBeNull();
  });
});

describe("sanitizeHeaderValue", () => {
  it("strips CR/LF and control characters", () => {
    expect(sanitizeHeaderValue("line1\r\nline2\u0000end")).toBe(
      "line1 line2 end"
    );
    expect(sanitizeHeaderValue("  spaced  ")).toBe("spaced");
  });
});

describe("isValidGmailLabelName", () => {
  it("accepts normal label names including spaces", () => {
    expect(isValidGmailLabelName("job-applications")).toBe(true);
    expect(isValidGmailLabelName("auto replied/v2")).toBe(true);
  });

  it("rejects unsafe names", () => {
    expect(isValidGmailLabelName('has"quote')).toBe(false);
    expect(isValidGmailLabelName("back\\slash")).toBe(false);
    expect(isValidGmailLabelName("new\r\nline")).toBe(false);
    expect(isValidGmailLabelName(" leading-space")).toBe(false);
    expect(isValidGmailLabelName("")).toBe(false);
    expect(isValidGmailLabelName("a".repeat(101))).toBe(false);
  });
});

describe("gmailLabelQueryTerm", () => {
  it("wraps names in quotes for Gmail search", () => {
    expect(gmailLabelQueryTerm("job-applications")).toBe(
      'label:"job-applications"'
    );
    expect(gmailLabelQueryTerm("auto replied")).toBe('label:"auto replied"');
  });

  it("throws on invalid names instead of emitting a broken query", () => {
    expect(() => gmailLabelQueryTerm('bad"name')).toThrow(
      /Invalid Gmail label name/
    );
  });
});
