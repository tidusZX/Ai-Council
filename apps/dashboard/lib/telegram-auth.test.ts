import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getUserAccess, ReadOnlyError, requireWrite } from "./telegram-auth.ts";

const originalAllowedUserIds = process.env.TELEGRAM_ALLOWED_USER_IDS;
const originalWriteUserIds = process.env.TELEGRAM_WRITE_USER_IDS;

afterEach(() => {
  process.env.TELEGRAM_ALLOWED_USER_IDS = originalAllowedUserIds;
  process.env.TELEGRAM_WRITE_USER_IDS = originalWriteUserIds;
});

describe("getUserAccess", () => {
  it("returns null for users outside TELEGRAM_ALLOWED_USER_IDS", () => {
    process.env.TELEGRAM_ALLOWED_USER_IDS = "123,456";
    process.env.TELEGRAM_WRITE_USER_IDS = "789";

    assert.equal(getUserAccess(789), null);
  });

  it("returns read for allowed users outside TELEGRAM_WRITE_USER_IDS", () => {
    process.env.TELEGRAM_ALLOWED_USER_IDS = "123, 456";
    process.env.TELEGRAM_WRITE_USER_IDS = "456";

    assert.equal(getUserAccess(123), "read");
  });

  it("returns write for allowed users in TELEGRAM_WRITE_USER_IDS", () => {
    process.env.TELEGRAM_ALLOWED_USER_IDS = "123,456";
    process.env.TELEGRAM_WRITE_USER_IDS = "456";

    assert.equal(getUserAccess("456"), "write");
  });
});

describe("requireWrite", () => {
  it("allows write access", () => {
    assert.doesNotThrow(() => requireWrite("write"));
  });

  it("throws ReadOnlyError for read or null access", () => {
    assert.throws(() => requireWrite("read"), ReadOnlyError);
    assert.throws(() => requireWrite(null), ReadOnlyError);
  });
});
