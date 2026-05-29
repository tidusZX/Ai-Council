import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractCommandCentreText,
  formatCommandCentreReply,
} from "@/lib/command-centre-format.ts";

describe("extractCommandCentreText", () => {
  it("removes /cc from natural updates", () => {
    assert.equal(
      extractCommandCentreText("/cc task follow up with Grain Traders Monday"),
      "task follow up with Grain Traders Monday",
    );
  });

  it("supports bot-addressed commands", () => {
    assert.equal(
      extractCommandCentreText("/cc@ShaqBot done set ManyChat keywords"),
      "done set ManyChat keywords",
    );
  });
});

describe("formatCommandCentreReply", () => {
  it("formats a compact Telegram confirmation", () => {
    assert.equal(
      formatCommandCentreReply({
        action: "create_task",
        client: "Grain Traders",
        dependency: "Lead list",
        due: "Monday",
        owner: "Shaq",
        priority: "High",
        rawUpdate: "follow up with Grain Traders Monday",
        status: "Planned",
        summary: "Follow up with Grain Traders.",
        title: "Follow up with Grain Traders",
        type: "task",
      }),
      [
        "Command Centre updated: Follow up with Grain Traders",
        "Shaq · Planned · High",
        "Due: Monday",
        "Client: Grain Traders",
      ].join("\n"),
    );
  });
});
