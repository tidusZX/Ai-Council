import type { CommandCentreUpdate } from "@/lib/anthropic.ts";

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

export function extractCommandCentreText(text: string): string {
  return text.replace(/^\/cc(?:@\w+)?(?:\s+|$)/i, "").trim();
}

export function formatCommandCentreReply(update: CommandCentreUpdate): string {
  const parts = [
    `Command Centre updated: ${truncate(update.title, 90)}`,
    `${update.owner} · ${update.status} · ${update.priority}`,
  ];

  if (update.due) {
    parts.push(`Due: ${truncate(update.due, 60)}`);
  }

  if (update.client) {
    parts.push(`Client: ${truncate(update.client, 80)}`);
  }

  return parts.join("\n");
}
