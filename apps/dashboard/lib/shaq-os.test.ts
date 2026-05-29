import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeShaqOsPhotoResponse } from "@/lib/shaq-os.ts";

describe("normalizeShaqOsPhotoResponse", () => {
  it("keeps analysis, caption, and caption options", () => {
    assert.deepEqual(
      normalizeShaqOsPhotoResponse({
        analysis: "Warm product scene with soft contrast.",
        caption: "Make it feel held, not sold.",
        captions: ["Caption one", "Caption two"],
      }),
      {
        analysis: "Warm product scene with soft contrast.",
        caption: "Make it feel held, not sold.",
        captions: ["Caption one", "Caption two"],
      },
    );
  });

  it("falls back to summary or result for analysis text", () => {
    assert.equal(
      normalizeShaqOsPhotoResponse({ summary: "Minimal cafe table scene." })
        .analysis,
      "Minimal cafe table scene.",
    );
    assert.equal(
      normalizeShaqOsPhotoResponse({ result: "Editorial product detail." })
        .analysis,
      "Editorial product detail.",
    );
  });

  it("drops non-string caption options", () => {
    assert.deepEqual(
      normalizeShaqOsPhotoResponse({
        captions: ["Useful", 123, null, "Also useful"],
      }).captions,
      ["Useful", "Also useful"],
    );
  });
});
