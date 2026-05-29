export type TelegramAccess = "write" | "read";

export class ReadOnlyError extends Error {
  constructor(message = "Telegram user does not have write access") {
    super(message);
    this.name = "ReadOnlyError";
  }
}

function parseUserIds(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function getUserAccess(userId: number | string): TelegramAccess | null {
  const id = String(userId);
  const allowedIds = parseUserIds(process.env.TELEGRAM_ALLOWED_USER_IDS);

  if (!allowedIds.has(id)) {
    return null;
  }

  const writeIds = parseUserIds(process.env.TELEGRAM_WRITE_USER_IDS);

  if (writeIds.has(id)) {
    return "write";
  }

  return "read";
}

export function requireWrite(
  access: TelegramAccess | null,
): asserts access is "write" {
  if (access !== "write") {
    throw new ReadOnlyError();
  }
}
