type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicMessageResponse = {
  content?: AnthropicTextBlock[];
};

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const CLAUDE_MODEL = process.env.ANALYSIS_MODEL ?? "claude-sonnet-4-5";
const TELEGRAM_RESPONSE_LIMIT = 500;

const SHAQ_SYSTEM_PROMPT = [
  "You are Shaq's conversational Telegram bot.",
  "Shaq is a Singapore commercial photographer, @getarchivedsg.",
  "He targets F&B and product brands and wants to grow toward a $10k MRR retainer business.",
  "Be concise, practical, warm, and commercially sharp.",
  "When useful, help him think in terms of positioning, outreach, retainers, shoots, content systems, and client value.",
  "Keep every reply under 500 characters for Telegram readability.",
].join(" ");

function getAnthropicApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  return apiKey;
}

export function limitTelegramText(text: string): string {
  const trimmed = text.trim();

  if (trimmed.length <= TELEGRAM_RESPONSE_LIMIT) {
    return trimmed;
  }

  return `${trimmed.slice(0, TELEGRAM_RESPONSE_LIMIT - 1).trimEnd()}…`;
}

export async function askShaqClaude(message: string): Promise<string> {
  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
      "x-api-key": getAnthropicApiKey(),
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 180,
      system: SHAQ_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API failed: ${response.status}`);
  }

  const data = (await response.json()) as AnthropicMessageResponse;
  const text =
    data.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim() || "I could not come up with a useful reply.";

  return limitTelegramText(text);
}
