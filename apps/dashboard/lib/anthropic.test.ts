import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { limitTelegramText } from "./anthropic.ts";

describe("limitTelegramText", () => {
  it("keeps short replies unchanged", () => {
    assert.equal(limitTelegramText("Sharp and useful."), "Sharp and useful.");
  });

  it("truncates long replies under the Telegram readability limit", () => {
    const result = limitTelegramText("x".repeat(650));

    assert.equal(result.length, 500);
    assert.ok(result.endsWith("…"));
  });
});
