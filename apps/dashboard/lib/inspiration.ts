export type CreateInspirationResponse = {
  id: string;
  status: "processing";
};

export type InspirationStatusResponse = {
  id: string;
  status: string;
  summary?: unknown;
};

type CreateInspirationInput = {
  apiBaseUrl: string;
  apiKey: string;
  telegramChatId: number;
  url: string;
};

type PollInspirationInput = {
  apiBaseUrl: string;
  apiKey: string;
  id: string;
  intervalMs?: number;
  maxAttempts?: number;
};

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_MAX_POLL_ATTEMPTS = 80;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;

function getApiUrl(apiBaseUrl: string, pathname: string): string {
  return new URL(pathname, apiBaseUrl).toString();
}

function trimTrailingUrlPunctuation(url: string): string {
  return url.replace(/[),.;!?]+$/u, "");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_PATTERN);

  return match ? trimTrailingUrlPunctuation(match[0]) : null;
}

export function getBotApiKey(): string {
  const apiKey =
    process.env.BOT_API_KEY ?? process.env.INSPIRATION_BOT_API_KEY ?? "";

  if (!apiKey) {
    throw new Error("BOT_API_KEY is not configured");
  }

  return apiKey;
}

export async function createInspiration({
  apiBaseUrl,
  apiKey,
  telegramChatId,
  url,
}: CreateInspirationInput): Promise<CreateInspirationResponse> {
  const response = await fetch(getApiUrl(apiBaseUrl, "/api/inspiration"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bot-api-key": apiKey,
    },
    body: JSON.stringify({
      url,
      source: "telegram",
      telegram_chat_id: telegramChatId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create inspiration job: ${response.status}`);
  }

  return (await response.json()) as CreateInspirationResponse;
}

export async function getInspirationStatus({
  apiBaseUrl,
  apiKey,
  id,
}: Omit<
  PollInspirationInput,
  "intervalMs" | "maxAttempts"
>): Promise<InspirationStatusResponse> {
  const response = await fetch(
    getApiUrl(apiBaseUrl, `/api/inspiration/${encodeURIComponent(id)}`),
    {
      headers: {
        "x-bot-api-key": apiKey,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch inspiration job ${id}: ${response.status}`);
  }

  return (await response.json()) as InspirationStatusResponse;
}

export async function pollInspirationUntilComplete({
  apiBaseUrl,
  apiKey,
  id,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxAttempts = DEFAULT_MAX_POLL_ATTEMPTS,
}: PollInspirationInput): Promise<InspirationStatusResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await delay(intervalMs);

    const result = await getInspirationStatus({ apiBaseUrl, apiKey, id });

    if (result.status === "complete") {
      return result;
    }

    if (result.status === "failed") {
      const raw = result as unknown as { error_message?: string };
      const reason =
        typeof raw.error_message === "string" && raw.error_message
          ? raw.error_message
          : "analysis failed";
      throw new Error(reason);
    }
  }

  throw new Error(`Inspiration job ${id} did not complete in time`);
}

export function formatInspirationSummary(
  result: InspirationStatusResponse,
): string {
  if (typeof result.summary === "string" && result.summary.trim()) {
    return result.summary.trim();
  }

  if (result.summary && typeof result.summary === "object") {
    return JSON.stringify(result.summary, null, 2);
  }

  return "Analysis complete.";
}
