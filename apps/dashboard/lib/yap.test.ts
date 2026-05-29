import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractYapText, formatYapSavedReply } from "@/lib/yap-format.ts";

describe("extractYapText", () => {
  it("removes the /yap command", () => {
    assert.equal(
      extractYapText("/yap Why are singaporeans so hateful"),
      "Why are singaporeans so hateful",
    );
  });

  it("supports bot-addressed commands", () => {
    assert.equal(
      extractYapText("/yap@ShaqBot Maybe we are all exhausted"),
      "Maybe we are all exhausted",
    );
  });
});

describe("formatYapSavedReply", () => {
  it("returns a compact saved reply with angle and hook", () => {
    assert.equal(
      formatYapSavedReply({
        title: "Why Singaporeans Seem So Hateful Online",
        cleanedThought: "Maybe the anger comes from exhaustion.",
        type: "Question",
        topics: ["Singapore", "Culture"],
        contentPotential: "High",
        suggestedAngle:
          "Maybe Singaporeans are not hateful; maybe they are exhausted and trained to spot flaws first.",
        hookIdeas: [
          "I don't think Singaporeans are hateful. I think we're tired.",
        ],
        formats: ["TikTok"],
      }),
      [
        "Saved to Yap Log: Why Singaporeans Seem So Hateful Online",
        "Angle: Maybe Singaporeans are not hateful; maybe they are exhausted and trained to spot flaws first.",
        "Hook: I don't think Singaporeans are hateful. I think we're tired.",
      ].join("\n"),
    );
  });
});
