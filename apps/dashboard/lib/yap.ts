import { analyzeYap, type YapAnalysis } from "@/lib/anthropic";
export { extractYapText, formatYapSavedReply } from "@/lib/yap-format";

type CreateYapInput = {
  analysis: YapAnalysis;
  rawYap: string;
};

const NOTION_API_URL = "https://api.notion.com/v1/pages";
const NOTION_VERSION = "2022-06-28";
const DEFAULT_YAP_DATABASE_ID = "5248b82d9962447a8d56ed328f4aadef";

const ALLOWED_TYPES = new Set([
  "Content idea",
  "Question",
  "Rant",
  "Observation",
  "Story",
  "Personal reflection",
  "Business idea",
  "Draft",
]);

const ALLOWED_TOPICS = new Set([
  "Singapore",
  "Photography",
  "F&B",
  "Product brands",
  "Creative work",
  "Identity",
  "Money",
  "Social media",
  "Culture",
  "Personal",
]);

const ALLOWED_CONTENT_POTENTIAL = new Set(["High", "Medium", "Low"]);
const ALLOWED_FORMATS = new Set([
  "TikTok",
  "IG caption",
  "Carousel",
  "Longform",
  "Voice note",
  "Tweet",
]);

function getNotionApiKey(): string {
  const apiKey = process.env.NOTION_API_KEY ?? "";

  if (!apiKey) {
    throw new Error("NOTION_API_KEY is not configured");
  }

  return apiKey;
}

function getYapDatabaseId(): string {
  return process.env.NOTION_YAP_DATABASE_ID ?? DEFAULT_YAP_DATABASE_ID;
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function selectAllowed(
  value: string,
  allowed: Set<string>,
  fallback: string,
): string {
  return allowed.has(value) ? value : fallback;
}

function multiSelectAllowed(values: string[], allowed: Set<string>) {
  return values
    .filter((value) => allowed.has(value))
    .slice(0, 5)
    .map((name) => ({ name }));
}

export async function createYapLogEntry({
  analysis,
  rawYap,
}: CreateYapInput): Promise<void> {
  const response = await fetch(NOTION_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${getNotionApiKey()}`,
      "content-type": "application/json",
      "notion-version": NOTION_VERSION,
    },
    body: JSON.stringify({
      parent: {
        database_id: getYapDatabaseId(),
      },
      properties: {
        Title: {
          title: [{ text: { content: truncate(analysis.title, 120) } }],
        },
        "Raw Yap": {
          rich_text: [{ text: { content: truncate(rawYap, 1900) } }],
        },
        "Cleaned Thought": {
          rich_text: [
            { text: { content: truncate(analysis.cleanedThought, 1900) } },
          ],
        },
        Type: {
          select: {
            name: selectAllowed(analysis.type, ALLOWED_TYPES, "Content idea"),
          },
        },
        Topics: {
          multi_select: multiSelectAllowed(analysis.topics, ALLOWED_TOPICS),
        },
        "Content Potential": {
          select: {
            name: selectAllowed(
              analysis.contentPotential,
              ALLOWED_CONTENT_POTENTIAL,
              "Medium",
            ),
          },
        },
        "Suggested Angle": {
          rich_text: [
            { text: { content: truncate(analysis.suggestedAngle, 1900) } },
          ],
        },
        "Hook Ideas": {
          rich_text: [
            { text: { content: truncate(analysis.hookIdeas.join("\n"), 1900) } },
          ],
        },
        Format: {
          multi_select: multiSelectAllowed(analysis.formats, ALLOWED_FORMATS),
        },
        Status: {
          status: { name: "Not started" },
        },
        Source: {
          select: { name: "Telegram" },
        },
        Created: {
          date: { start: new Date().toISOString() },
        },
        Posted: {
          checkbox: false,
        },
      },
      children: [
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{ type: "text", text: { content: "Raw yap" } }],
          },
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: rawYap } }],
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Notion Yap Log create failed: ${response.status}`);
  }
}

export async function saveYap(rawYap: string): Promise<YapAnalysis> {
  const analysis = await analyzeYap(rawYap);

  await createYapLogEntry({ analysis, rawYap });

  return analysis;
}
