type TelegramApiResponse<T> =
  | {
      ok: true;
      result: T;
    }
  | {
      ok: false;
      description?: string;
    };

export type TelegramFile = {
  file_id: string;
  file_path?: string;
  file_size?: number;
  file_unique_id: string;
};

function getTelegramApiUrl(method: string): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  return `https://api.telegram.org/bot${token}/${method}`;
}

function getTelegramFileUrl(filePath: string): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  return `https://api.telegram.org/file/bot${token}/${filePath}`;
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
    const msg = !data.ok ? data.description : undefined; throw new Error(msg ?? `Telegram API ${method} failed`);
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
  action: "typing" | "upload_photo",
): Promise<unknown> {
  return callTelegramApi("sendChatAction", {
    chat_id: chatId,
    action,
  });
}

export async function getTelegramFile(fileId: string): Promise<TelegramFile> {
  return callTelegramApi("getFile", {
    file_id: fileId,
  });
}

export async function downloadTelegramFile(
  file: TelegramFile,
): Promise<ArrayBuffer> {
  if (!file.file_path) {
    throw new Error("Telegram file_path is missing");
  }

  const response = await fetch(getTelegramFileUrl(file.file_path));

  if (!response.ok) {
    throw new Error(`Telegram file download failed: ${response.status}`);
  }

  return response.arrayBuffer();
}
