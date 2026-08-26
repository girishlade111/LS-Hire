import { describe, expect, it } from "vitest";
import { DEFAULTS, normalize } from "../lib/redis/settings";
import { normalizeAnalysis } from "../lib/ai/analyze";

describe("settings normalize", () => {
  it("returns defaults when nothing is stored", () => {
    expect(normalize(null)).toEqual(DEFAULTS);
    expect(normalize({})).toEqual({ ...DEFAULTS });
  });

  it("keeps valid stored values", () => {
    const raw = {
      replyMethod: "resend",
      jobLabelName: "apps",
      processedLabelName: "done",
      hrPersonaPrompt: "Be terse.",
      resendFromEmail: "hr@example.com"
    };
    expect(normalize(raw)).toEqual({
      replyMethod: "resend",
      jobLabelName: "apps",
      processedLabelName: "done",
      hrPersonaPrompt: "Be terse.",
      resendFromEmail: "hr@example.com"
    });
  });

  it("falls back to defaults for corrupt values", () => {
    const result = normalize({
      replyMethod: "carrier-pigeon",
      jobLabelName: "",
      processedLabelName: "",
      hrPersonaPrompt: "",
      resendFromEmail: ""
    });
    expect(result.replyMethod).toBe("gmail");
    expect(result.jobLabelName).toBe(DEFAULTS.jobLabelName);
    expect(result.processedLabelName).toBe(DEFAULTS.processedLabelName);
    expect(result.hrPersonaPrompt).toBe(DEFAULTS.hrPersonaPrompt);
    expect(result.resendFromEmail).toBeUndefined();
  });
});

describe("normalizeAnalysis (OpenAI response validation)", () => {
  const valid = JSON.stringify({
    isJobApplication: true,
    candidateName: "Jane Doe",
    candidateEmail: "jane@example.com",
    positionApplied: "Backend Engineer",
    replySubject: "Re: Application",
    replyBody: "Thanks for applying!"
  });

  it("accepts a well-formed response", () => {
    expect(normalizeAnalysis(valid)).toMatchObject({
      isJobApplication: true,
      candidateEmail: "jane@example.com"
    });
  });

  it("throws a descriptive error on malformed JSON", () => {
    expect(() => normalizeAnalysis("not json at all")).toThrow(
      /malformed JSON/
    );
  });

  it("throws on schema violations", () => {
    const missingField = JSON.stringify({
      isJobApplication: true,
      candidateName: null,
      candidateEmail: null,
      positionApplied: null
      // replySubject and replyBody missing
    });
    expect(() => normalizeAnalysis(missingField)).toThrow(
      /failed schema validation/
    );
  });

  it("throws on wrong types", () => {
    const wrongType = JSON.stringify({
      isJobApplication: "yes",
      candidateName: null,
      candidateEmail: null,
      positionApplied: null,
      replySubject: "s",
      replyBody: "b"
    });
    expect(() => normalizeAnalysis(wrongType)).toThrow();
  });
});
