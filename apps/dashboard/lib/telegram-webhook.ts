import { getUserAccess, type TelegramAccess } from "@/lib/telegram-auth";
import { getCommand, getTelegramHelpText } from "@/lib/telegram-help";
import { sendTelegramChatAction, sendTelegramMessage } from "@/lib/telegram";

export type TelegramUser = {
  id?: number;
};

export type TelegramChat = {
  id?: number;
};

export type TelegramMessage = {
  text?: string;
  chat?: TelegramChat;
  from?: TelegramUser;
};

export type TelegramUpdate = {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

type ProcessTelegramUpdateOptions = {
  faqPath: string;
  getAccess?: (userId: number) => TelegramAccess | null;
  sendChatAction?: (chatId: number, action: "typing") => Promise<unknown>;
  sendMessage?: (chatId: number, text: string) => Promise<unknown>;
};

export type ProcessTelegramUpdateResult = {
  ok: true;
  replied: boolean;
};

const TELEGRAM_MESSAGE_LIMIT = 4096;

function getMessage(update: TelegramUpdate): TelegramMessage | undefined {
  return update.message ?? update.edited_message;
}

async function replyInChunks(
  chatId: number,
  text: string,
  sendMessage: (chatId: number, text: string) => Promise<unknown>,
): Promise<void> {
  for (let start = 0; start < text.length; start += TELEGRAM_MESSAGE_LIMIT) {
    await sendMessage(chatId, text.slice(start, start + TELEGRAM_MESSAGE_LIMIT));
  }
}

export async function processTelegramUpdate(
  update: TelegramUpdate,
  {
    faqPath,
    getAccess = getUserAccess,
    sendChatAction = sendTelegramChatAction,
    sendMessage = sendTelegramMessage,
  }: ProcessTelegramUpdateOptions,
): Promise<ProcessTelegramUpdateResult> {
  const message = getMessage(update);
  const userId = message?.from?.id;
  const chatId = message?.chat?.id;

  if (!userId || !chatId) {
    return { ok: true, replied: false };
  }

  const access = getAccess(userId);

  if (!access) {
    return { ok: true, replied: false };
  }

  const text = message.text?.trim() || "";

  if (!text) {
    return { ok: true, replied: false };
  }

  const command = getCommand(text);

  // Detect reel/video URLs — save them to the inspiration log automatically.
  if (isVideoUrl(text)) {
    await sendChatAction(chatId, "typing");
    const reply = await saveInspirationFromTelegram(text, chatId, access);
    await replyInChunks(chatId, reply, sendMessage);
    return { ok: true, replied: true };
  }

  const replyText =
    command === "/start" || command === "/help"
      ? await getTelegramHelpText(text, faqPath)
      : `[${access}] ${text}`;

  await sendChatAction(chatId, "typing");
  await replyInChunks(chatId, replyText, sendMessage);

  return { ok: true, replied: true };
}

/**
 * Returns true if the message text looks like a video URL from a
 * supported platform (Instagram, TikTok, YouTube Shorts).
 */
function isVideoUrl(text: string): boolean {
  try {
    const url = new URL(text)
    return (
      /instagram\.com\/(reel|p)\//i.test(url.pathname) ||
      /tiktok\.com\/@.+\/video\//i.test(url.href) ||
      /youtube\.com\/shorts\//i.test(url.href) ||
      /youtu\.be\//i.test(url.href)
    )
  } catch {
    return false
  }
}

/**
 * POST to /api/inspiration to kick off analysis and return a
 * Telegram-friendly acknowledgement. Uses the dashboard's own API
 * key for bot-to-API auth.
 */
async function saveInspirationFromTelegram(
  url: string,
  chatId: number,
  access: TelegramAccess,
): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const botApiKey = process.env.TELEGRAM_BOT_API_KEY ?? ""

  if (!botApiKey) {
    return "⚠️ Bot API key not configured — can't save to inspiration log."
  }

  try {
    const res = await fetch(`${appUrl}/api/inspiration`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bot-api-key": botApiKey,
      },
      body: JSON.stringify({
        url,
        source: "telegram",
        telegram_chat_id: String(chatId),
        telegram_access: access,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return `❌ Failed to save: ${body?.error ?? res.status}`
    }

    const { id } = await res.json()
    return (
      `✅ Saved! Analysing now (~60s)...\n\n` +
      `I'll send the summary here when it's ready.\n` +
      `View full log: ${appUrl}/inspiration`
    )
  } catch (e) {
    return `❌ Error: ${e instanceof Error ? e.message : String(e)}`
  }
}
