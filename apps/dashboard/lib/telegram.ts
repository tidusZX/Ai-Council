type TelegramApiResponse<T> =
  | {
      ok: true;
      result: T;
    }
  | {
      ok: false;
      description?: string;
    };

function getTelegramApiUrl(method: string): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  return `https://api.telegram.org/bot${token}/${method}`;
}

async function callTelegramApi<T>(
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(getTelegramApiUrl(method), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as TelegramApiResponse<T>;

  if (!response.ok || !data.ok) {
    const msg = !data.ok ? data.description : undefined
    throw new Error(msg ?? `Telegram API ${method} failed`);
  }

  return data.result;
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
): Promise<unknown> {
  return callTelegramApi("sendMessage", {
    chat_id: chatId,
    text,
  });
}

export async function sendTelegramChatAction(
  chatId: number | string,
  action: "typing",
): Promise<unknown> {
  return callTelegramApi("sendChatAction", {
    chat_id: chatId,
    action,
  });
}
