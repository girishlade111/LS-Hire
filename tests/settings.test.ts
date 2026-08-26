import { describe, it, expect } from "vitest";
import { normalize } from "@/lib/redis/settings";

describe("settings.normalize", () => {
  it("returns defaults when nothing stored", () => {
    const settings = normalize(null);
    expect(settings.replyMethod).toBe("gmail");
    expect(settings.jobLabelName).toBe("job-applications");
    expect(settings.processedLabelName).toBe("auto-replied");
    expect(settings.hrPersonaPrompt.length).toBeGreaterThan(0);
    expect(settings.resendFromEmail).toBeUndefined();
  });

  it("keeps valid stored values", () => {
    const settings = normalize({
      replyMethod: "resend",
      jobLabelName: "applications",
      processedLabelName: "done",
      hrPersonaPrompt: "Be brief.",
      resendFromEmail: "hr@company.com"
    });
    expect(settings.replyMethod).toBe("resend");
    expect(settings.jobLabelName).toBe("applications");
    expect(settings.processedLabelName).toBe("done");
    expect(settings.hrPersonaPrompt).toBe("Be brief.");
    expect(settings.resendFromEmail).toBe("hr@company.com");
  });

  it("drops invalid replyMethod and empty strings on read", () => {
    const settings = normalize({
      replyMethod: "carrier-pigeon",
      jobLabelName: "",
      processedLabelName: "",
      hrPersonaPrompt: "",
      resendFromEmail: ""
    });
    expect(settings.replyMethod).toBe("gmail");
    expect(settings.jobLabelName).toBe("job-applications");
    expect(settings.processedLabelName).toBe("auto-replied");
    expect(settings.hrPersonaPrompt.length).toBeGreaterThan(0);
    expect(settings.resendFromEmail).toBeUndefined();
  });
});
