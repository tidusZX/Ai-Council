import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractFirstUrl,
  formatInspirationSummary,
  type InspirationStatusResponse,
} from "./inspiration.ts";

describe("extractFirstUrl", () => {
  it("returns the first http or https URL", () => {
    assert.equal(
      extractFirstUrl(
        "save this https://example.com/post and this https://x.test",
      ),
      "https://example.com/post",
    );
  });

  it("trims common trailing punctuation", () => {
    assert.equal(
      extractFirstUrl("Interesting: https://example.com/post)."),
      "https://example.com/post",
    );
  });

  it("returns null when no URL exists", () => {
    assert.equal(extractFirstUrl("no link here"), null);
  });
});

describe("formatInspirationSummary", () => {
  it("returns a string summary as-is", () => {
    const result: InspirationStatusResponse = {
      id: "abc",
      status: "complete",
      summary: "A useful summary.",
    };

    assert.equal(formatInspirationSummary(result), "A useful summary.");
  });

  it("formats object summaries as JSON", () => {
    const result: InspirationStatusResponse = {
      id: "abc",
      status: "complete",
      summary: { title: "Useful", bullets: ["One"] },
    };

    assert.equal(
      formatInspirationSummary(result),
      '{\n  "title": "Useful",\n  "bullets": [\n    "One"\n  ]\n}',
    );
  });

  it("falls back when no summary is present", () => {
    const result: InspirationStatusResponse = {
      id: "abc",
      status: "complete",
    };

    assert.equal(formatInspirationSummary(result), "Analysis complete.");
  });
});
