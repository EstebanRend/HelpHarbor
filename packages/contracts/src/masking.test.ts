import { describe, expect, it } from "vitest";
import { maskEmail, maskName, redactEmails } from "./index";

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("marta.admin@acme-cloud.example")).toBe("m***@acme-cloud.example");
    expect(maskEmail("  A@Globex-Hosting.Example ")).toBe("A***@globex-hosting.example");
  });

  it("hides anything that is not an email completely", () => {
    expect(maskEmail("not-an-email")).toBe("***");
    expect(maskEmail("@acme-cloud.example")).toBe("***");
    expect(maskEmail("ana@")).toBe("***");
    expect(maskEmail("")).toBe("***");
  });
});

describe("maskName", () => {
  it("keeps initials only", () => {
    expect(maskName("Marta Ruiz")).toBe("M. R.");
    expect(maskName("  tomás   vidal ")).toBe("T. V.");
    expect(maskName("   ")).toBe("***");
  });
});

describe("redactEmails", () => {
  it("masks every address inside free text and leaves the rest", () => {
    const text = 'duplicate key { emailNormalized: "ana.agent@acme-cloud.example" } and Hugo.Lead@Globex-Hosting.example';
    expect(redactEmails(text)).toBe(
      'duplicate key { emailNormalized: "a***@acme-cloud.example" } and H***@globex-hosting.example',
    );
  });

  it("returns text without addresses unchanged", () => {
    expect(redactEmails("GET /api/v1/tenant failed [req-123]")).toBe("GET /api/v1/tenant failed [req-123]");
  });
});
