import { expect, it } from "vitest";
import { sanitizeExport } from "./export.js";
it("redacts common source, header, URL, private-key and structured credentials while preserving ordinary behavior data", () => {
  const text =
    'const apiKey = "fictional-sensitive-value"; const password: "fictional-password"; Bearer fictional-bearer mongodb://name:fictional-db-secret@host/\n-----BEGIN PRIVATE KEY-----\nfictional-key\n-----END PRIVATE KEY-----';
  const result = JSON.stringify(
    sanitizeExport({
      source: text,
      api_key: "fictional-field",
      fixtures: { quantity: 3, label: "fictional quote" },
    }),
  );
  for (const secret of [
    "fictional-sensitive-value",
    "fictional-password",
    "fictional-bearer",
    "fictional-db-secret",
    "fictional-key",
    "fictional-field",
  ])
    expect(result).not.toContain(secret);
  expect(result).toContain("fictional quote");
  expect(result).toContain("3");
  expect(sanitizeExport(sanitizeExport({ source: text }))).toEqual(
    sanitizeExport({ source: text }),
  );
});
