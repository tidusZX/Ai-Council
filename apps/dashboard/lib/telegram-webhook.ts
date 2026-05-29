import {
  createInspiration,
  extractFirstUrl,
  formatInspirationSummary,
  getBotApiKey,
  pollInspirationUntilComplete,
} from "@/lib/inspiration";
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
  apiBaseUrl: string;
  faqPath: string;
  getInspirationApiKey?: () => string;
  getAccess?: (userId: number) => TelegramAccess | null;
  sendChatAction?: (chatId: number, action: "typing") => Promise<unknown>;
  sendMessage?: (chatId: number, text: string) => Promise<unknown>;
};

export type ProcessTelegramUpdateResult = {
  followUp?: Promise<void>;
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
    apiBaseUrl,
    faqPath,
    getInspirationApiKey = getBotApiKey,
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

  if (command !== "/start" && command !== "/help" && access === "write") {
    const url = extractFirstUrl(text);

    if (url) {
      const apiKey = getInspirationApiKey();
      const job = await createInspiration({
        apiBaseUrl,
        apiKey,
        telegramChatId: chatId,
        url,
      });
      const followUp = pollInspirationUntilComplete({
        apiBaseUrl,
        apiKey,
        id: job.id,
      })
        .then(async (result) => {
          await sendMessage(chatId, formatInspirationSummary(result));
        })
        .catch(async (error: unknown) => {
          const detail =
            error instanceof Error ? error.message : "Unknown error";
          await sendMessage(chatId, `Analysis failed: ${detail}`);
        });

      await sendChatAction(chatId, "typing");
      await sendMessage(chatId, "Saved! Analysing…");

      return { followUp, ok: true, replied: true };
    }
  }

  const replyText =
    command === "/start" || command === "/help"
      ? await getTelegramHelpText(text, faqPath)
      : `[${access}] ${text}`;

  await sendChatAction(chatId, "typing");
  await replyInChunks(chatId, replyText, sendMessage);

  return { ok: true, replied: true };
}
