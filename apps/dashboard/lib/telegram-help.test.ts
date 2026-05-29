import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  getCommand,
  getHelpCategory,
  getSectionByHeading,
  getTelegramHelpText,
} from "./telegram-help.ts";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("getCommand", () => {
  it("normalizes direct and bot-addressed commands", () => {
    assert.equal(getCommand("/help"), "/help");
    assert.equal(getCommand("/help@MyBot billing"), "/help");
    assert.equal(getCommand("/START"), "/start");
  });
});

describe("getHelpCategory", () => {
  it("returns categories only for /help", () => {
    assert.equal(getHelpCategory("/help billing"), "billing");
    assert.equal(getHelpCategory("/help@MyBot Billing"), "billing");
    assert.equal(getHelpCategory("/start billing"), null);
    assert.equal(getHelpCategory("/help"), null);
  });
});

describe("getSectionByHeading", () => {
  it("returns the matching ## section", () => {
    const markdown = [
      "# FAQ",
      "",
      "Intro",
      "",
      "## Billing",
      "Billing answer",
      "",
      "## Deploys",
      "Deploy answer",
    ].join("\n");

    assert.equal(
      getSectionByHeading(markdown, "billing"),
      "## Billing\nBilling answer",
    );
  });
});

describe("getTelegramHelpText", () => {
  it("returns the whole FAQ for /start and /help without category", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "telegram-help-"));
    tempDirs.push(dir);
    const faqPath = path.join(dir, "faq.md");

    await writeFile(faqPath, "# FAQ\n\n## Billing\nBilling answer\n");

    assert.equal(
      await getTelegramHelpText("/start billing", faqPath),
      "# FAQ\n\n## Billing\nBilling answer",
    );
    assert.equal(
      await getTelegramHelpText("/help", faqPath),
      "# FAQ\n\n## Billing\nBilling answer",
    );
  });

  it("returns a category section for /help category", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "telegram-help-"));
    tempDirs.push(dir);
    const faqPath = path.join(dir, "faq.md");

    await writeFile(faqPath, "# FAQ\n\n## Billing\nBilling answer\n");

    assert.equal(
      await getTelegramHelpText("/help billing", faqPath),
      "## Billing\nBilling answer",
    );
  });

  it("returns a graceful fallback when the FAQ file is missing", async () => {
    assert.equal(
      await getTelegramHelpText("/help", "/tmp/does-not-exist.md"),
      "Telegram bot help is not available yet.",
    );
  });
});
