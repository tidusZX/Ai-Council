import {
  createInspiration,
  extractFirstUrl,
  formatInspirationSummary,
  getBotApiKey,
  pollInspirationUntilComplete,
} from "@/lib/inspiration";
import { askShaqClaude, limitTelegramText } from "@/lib/anthropic";
import { getUserAccess, type TelegramAccess } from "@/lib/telegram-auth";
import { getCommand, getTelegramHelpText } from "@/lib/telegram-help";
import { sendTelegramChatAction, sendTelegramMessage } from "@/lib/telegram";
import { sharpenCaption } from "@/lib/voice";
import { extractYapText, formatYapSavedReply, saveYap } from "@/lib/yap";
import {
  extractCommandCentreText,
  formatCommandCentreReply,
  saveCommandCentreUpdate,
} from "@/lib/command-centre";
import {
  generateCaptionFromTelegramPhoto,
  type TelegramPhotoSize,
} from "@/lib/photo-caption";

export type TelegramUser = {
  id?: number;
};

export type TelegramChat = {
  id?: number;
};

export type TelegramMessage = {
  caption?: string;
  text?: string;
  chat?: TelegramChat;
  from?: TelegramUser;
  photo?: TelegramPhotoSize[];
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
  sendChatAction?: (
    chatId: number,
    action: "typing" | "upload_photo",
  ) => Promise<unknown>;
  sendMessage?: (chatId: number, text: string) => Promise<unknown>;
};

export type ProcessTelegramUpdateResult = {
  followUp?: () => Promise<void>;
  ok: true;
  replied: boolean;
};

const TELEGRAM_MESSAGE_LIMIT = 4096;

function getMessage(update: TelegramUpdate): TelegramMessage | undefined {
  return update.message ?? update.edited_message;
}

// Question words and conversational openers — these should go to Claude chat,
// NOT to Ember caption sharpening. A real caption draft never starts with
// "what", "who", "why", "tell me", "can you", etc. and never ends with "?".
const CONVERSATIONAL_PREFIXES =
  /^(what|who|where|when|why|how|tell|can|could|do|does|did|is|are|was|were|will|would|should|help|explain|i am|i'm|i was|i've|i need|i want|let's|just|so |oh |hey |hi |hello|okay|ok )/i;

function looksLikeCaptionDraft(text: string): boolean {
  if (text.length <= 20) return false;
  if (extractFirstUrl(text)) return false;
  if (text.trimEnd().endsWith("?")) return false;          // questions → Claude
  if (CONVERSATIONAL_PREFIXES.test(text)) return false;    // conversation → Claude
  return true;
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

async function runFollowUp(
  chatId: number,
  work: () => Promise<string>,
  sendChatAction: (
    chatId: number,
    action: "typing" | "upload_photo",
  ) => Promise<unknown>,
  sendMessage: (chatId: number, text: string) => Promise<unknown>,
): Promise<void> {
  try {
    await sendChatAction(chatId, "typing");
    await sendMessage(chatId, limitTelegramText(await work()));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    await sendMessage(chatId, `Something broke: ${detail}`);
  }
}

async function runYapFollowUp(
  chatId: number,
  rawYap: string,
  sendChatAction: (
    chatId: number,
    action: "typing" | "upload_photo",
  ) => Promise<unknown>,
  sendMessage: (chatId: number, text: string) => Promise<unknown>,
): Promise<void> {
  try {
    await sendChatAction(chatId, "typing");
    await sendMessage(chatId, "Yapped. Logging it…");
    await sendChatAction(chatId, "typing");
    await sendMessage(
      chatId,
      limitTelegramText(formatYapSavedReply(await saveYap(rawYap))),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    await sendMessage(chatId, `Yap failed: ${detail}`);
  }
}

async function runCommandCentreFollowUp(
  chatId: number,
  rawUpdate: string,
  sendChatAction: (
    chatId: number,
    action: "typing" | "upload_photo",
  ) => Promise<unknown>,
  sendMessage: (chatId: number, text: string) => Promise<unknown>,
): Promise<void> {
  try {
    await sendChatAction(chatId, "typing");
    await sendMessage(chatId, "Updating Command Centre…");
    await sendChatAction(chatId, "typing");
    await sendMessage(
      chatId,
      limitTelegramText(
        formatCommandCentreReply(await saveCommandCentreUpdate(rawUpdate)),
      ),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    await sendMessage(chatId, `Command Centre update failed: ${detail}`);
  }
}

async function runPhotoFollowUp(
  chatId: number,
  photos: TelegramPhotoSize[],
  caption: string | undefined,
  sendChatAction: (
    chatId: number,
    action: "typing" | "upload_photo",
  ) => Promise<unknown>,
  sendMessage: (chatId: number, text: string) => Promise<unknown>,
): Promise<void> {
  try {
    await sendChatAction(chatId, "upload_photo");
    await sendMessage(chatId, "Got the photo. Running it through SHAQ OS…");
    await sendChatAction(chatId, "typing");
    await sendMessage(
      chatId,
      await generateCaptionFromTelegramPhoto({ caption, photos }),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    await sendMessage(chatId, `Photo analysis failed: ${detail}`);
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

  if (message.photo?.length) {
    if (access !== "write") {
      await sendChatAction(chatId, "typing");
      await sendMessage(chatId, "Photo captioning is write-only for now.");

      return { ok: true, replied: true };
    }

    return {
      followUp: () =>
        runPhotoFollowUp(
          chatId,
          message.photo ?? [],
          message.caption?.trim() || undefined,
          sendChatAction,
          sendMessage,
        ),
      ok: true,
      replied: true,
    };
  }

  const text = message.text?.trim() || "";

  if (!text) {
    return { ok: true, replied: false };
  }

  const command = getCommand(text);

  if (command === "/start" || command === "/help") {
    await sendChatAction(chatId, "typing");
    await replyInChunks(
      chatId,
      await getTelegramHelpText(text, faqPath),
      sendMessage,
    );

    return { ok: true, replied: true };
  }

  if (command === "/yap") {
    if (access !== "write") {
      await sendChatAction(chatId, "typing");
      await sendMessage(chatId, "Yap Log is write-only for now.");

      return { ok: true, replied: true };
    }

    const rawYap = extractYapText(text);

    if (!rawYap) {
      await sendChatAction(chatId, "typing");
      await sendMessage(
        chatId,
        "Send it like: /yap why are singaporeans so hateful",
      );

      return { ok: true, replied: true };
    }

    return {
      followUp: () =>
        runYapFollowUp(chatId, rawYap, sendChatAction, sendMessage),
      ok: true,
      replied: true,
    };
  }

  if (command === "/cc") {
    if (access !== "write") {
      await sendChatAction(chatId, "typing");
      await sendMessage(chatId, "Command Centre updates are write-only.");

      return { ok: true, replied: true };
    }

    const rawUpdate = extractCommandCentreText(text);

    if (!rawUpdate) {
      await sendChatAction(chatId, "typing");
      await sendMessage(
        chatId,
        "Send it like: /cc task follow up with Grain Traders Monday",
      );

      return { ok: true, replied: true };
    }

    return {
      followUp: () =>
        runCommandCentreFollowUp(
          chatId,
          rawUpdate,
          sendChatAction,
          sendMessage,
        ),
      ok: true,
      replied: true,
    };
  }

  const url = extractFirstUrl(text);

  if (url) {
    if (access === "write") {
      const followUp = async () => {
        try {
          const apiKey = getInspirationApiKey();
          const job = await createInspiration({
            apiBaseUrl,
            apiKey,
            telegramChatId: chatId,
            url,
          });

          await sendChatAction(chatId, "typing");
          await sendMessage(chatId, "Saved! Analysing…");

          const result = await pollInspirationUntilComplete({
            apiBaseUrl,
            apiKey,
            id: job.id,
          });

          await sendMessage(chatId, formatInspirationSummary(result));
        } catch (error: unknown) {
          const detail =
            error instanceof Error ? error.message : "Unknown error";
          await sendMessage(chatId, `Analysis failed: ${detail}`);
        }
      };

      return { followUp, ok: true, replied: true };
    }

    await sendChatAction(chatId, "typing");
    await sendMessage(chatId, `[${access}] ${text}`);

    return { ok: true, replied: true };
  }

  if (looksLikeCaptionDraft(text)) {
    return {
      followUp: () =>
        runFollowUp(
          chatId,
          () =>
            sharpenCaption({
              apiBaseUrl,
              apiKey: getInspirationApiKey(),
              text,
            }),
          sendChatAction,
          sendMessage,
        ),
      ok: true,
      replied: true,
    };
  }

  return {
    followUp: () =>
      runFollowUp(
        chatId,
        () => askShaqClaude(text),
        sendChatAction,
        sendMessage,
      ),
    ok: true,
    replied: true,
  };
}
