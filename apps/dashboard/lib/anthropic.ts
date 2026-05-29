type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicMessageResponse = {
  content?: AnthropicTextBlock[];
};

export type YapAnalysis = {
  title: string;
  cleanedThought: string;
  type: string;
  topics: string[];
  contentPotential: string;
  suggestedAngle: string;
  hookIdeas: string[];
  formats: string[];
};

export type CommandCentreUpdate = {
  action: string;
  amount?: number | null;
  client?: string;
  dependency?: string;
  due?: string;
  owner: string;
  priority: string;
  rawUpdate: string;
  status: string;
  summary: string;
  title: string;
  type: string;
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

const YAP_SYSTEM_PROMPT = [
  "You turn Shaq's raw Telegram rambles into structured Notion content-bank entries.",
  "Shaq is a Singapore commercial photographer, @getarchivedsg.",
  "He uses this for personal thoughts, culture observations, content ideas, photography ideas, and business angles.",
  "Keep the raw idea's edge. Do not sanitize it into bland corporate language.",
  "Return only valid JSON with these keys: title, cleanedThought, type, topics, contentPotential, suggestedAngle, hookIdeas, formats.",
  "type must be one of: Content idea, Question, Rant, Observation, Story, Personal reflection, Business idea, Draft.",
  "contentPotential must be High, Medium, or Low.",
  "topics must use relevant values from: Singapore, Photography, F&B, Product brands, Creative work, Identity, Money, Social media, Culture, Personal.",
  "formats must use relevant values from: TikTok, IG caption, Carousel, Longform, Voice note, Tweet.",
  "hookIdeas should contain 2-3 punchy hooks.",
].join(" ");

const PHOTO_CAPTION_SYSTEM_PROMPT = [
  "You write captions for Shaq, a Singapore commercial photographer, @getarchivedsg.",
  "Use the SHAQ OS photo analysis to create caption options for F&B/product brand content.",
  "Make it specific, observational, and commercially useful without sounding like an ad.",
  "Return 2-3 caption options. Keep the whole reply under 500 characters.",
].join(" ");

const COMMAND_CENTRE_SYSTEM_PROMPT = [
  "You convert Shaq's Telegram /cc updates into structured Command Centre updates.",
  "The Command Centre tracks @getarchivedsg weekly tasks, owners, status, due dates, dependencies, leads, blockers, revenue, and Friday summaries.",
  "Shaq is a Singapore commercial photographer. Keep updates operational and concise.",
  "Return only valid JSON with keys: action, type, title, summary, owner, status, due, priority, dependency, client, amount.",
  "action must be one of: create_task, update_task, mark_done, add_blocker, add_lead, add_revenue, add_summary, note.",
  "type must be one of: task, blocker, lead, revenue, summary, note.",
  "owner must be Shaq, Partner, or Shared.",
  "status must be Planned, In Progress, Waiting, Blocked, Done, or Note.",
  "priority must be High, Med, Low, or None.",
  "Use null for missing optional fields.",
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

async function createAnthropicMessage({
  maxTokens,
  message,
  system,
}: {
  maxTokens: number;
  message: string;
  system: string;
}): Promise<string> {
  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
      "x-api-key": getAnthropicApiKey(),
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
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

  return text;
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("Claude returned no JSON object");
    }

    return JSON.parse(match[0]);
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export async function askShaqClaude(message: string): Promise<string> {
  return limitTelegramText(
    await createAnthropicMessage({
      maxTokens: 180,
      message,
      system: SHAQ_SYSTEM_PROMPT,
    }),
  );
}

export async function captionFromPhotoAnalysis({
  analysis,
  userCaption,
}: {
  analysis: string;
  userCaption?: string;
}): Promise<string> {
  return limitTelegramText(
    await createAnthropicMessage({
      maxTokens: 220,
      message: [
        `SHAQ OS analysis:\n${analysis || "No analysis text returned."}`,
        userCaption ? `User note/caption:\n${userCaption}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      system: PHOTO_CAPTION_SYSTEM_PROMPT,
    }),
  );
}

export async function analyzeYap(rawYap: string): Promise<YapAnalysis> {
  const data = parseJsonObject(
    await createAnthropicMessage({
      maxTokens: 700,
      message: rawYap,
      system: YAP_SYSTEM_PROMPT,
    }),
  ) as Partial<YapAnalysis>;

  return {
    title: typeof data.title === "string" ? data.title : "Untitled yap",
    cleanedThought:
      typeof data.cleanedThought === "string" ? data.cleanedThought : rawYap,
    type: typeof data.type === "string" ? data.type : "Content idea",
    topics: asStringArray(data.topics),
    contentPotential:
      typeof data.contentPotential === "string"
        ? data.contentPotential
        : "Medium",
    suggestedAngle:
      typeof data.suggestedAngle === "string" ? data.suggestedAngle : "",
    hookIdeas: asStringArray(data.hookIdeas),
    formats: asStringArray(data.formats),
  };
}

export async function analyzeCommandCentreUpdate(
  rawUpdate: string,
): Promise<CommandCentreUpdate> {
  const data = parseJsonObject(
    await createAnthropicMessage({
      maxTokens: 500,
      message: rawUpdate,
      system: COMMAND_CENTRE_SYSTEM_PROMPT,
    }),
  ) as Partial<CommandCentreUpdate>;

  return {
    action: typeof data.action === "string" ? data.action : "note",
    amount: typeof data.amount === "number" ? data.amount : null,
    client: typeof data.client === "string" ? data.client : undefined,
    dependency:
      typeof data.dependency === "string" ? data.dependency : undefined,
    due: typeof data.due === "string" ? data.due : undefined,
    owner: typeof data.owner === "string" ? data.owner : "Shared",
    priority: typeof data.priority === "string" ? data.priority : "None",
    rawUpdate,
    status: typeof data.status === "string" ? data.status : "Note",
    summary: typeof data.summary === "string" ? data.summary : rawUpdate,
    title: typeof data.title === "string" ? data.title : "Command Centre update",
    type: typeof data.type === "string" ? data.type : "note",
  };
}
