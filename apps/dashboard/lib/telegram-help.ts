import { readFile } from "node:fs/promises";

export function getHelpCategory(commandText: string): string | null {
  const command = getCommand(commandText);

  if (command !== "/help") {
    return null;
  }

  const [, category] = commandText.trim().split(/\s+(.+)/);
  return category?.trim().toLowerCase() || null;
}

export function getCommand(text: string): string {
  const [commandPart = ""] = text.trim().split(/\s+/, 1);
  return commandPart.split("@")[0].toLowerCase();
}

export function getSectionByHeading(
  markdown: string,
  category: string,
): string | null {
  const sections = markdown.split(/^##\s+/m);

  sections.shift();

  for (const section of sections) {
    const [headingLine = "", ...bodyLines] = section.split(/\r?\n/);
    const heading = headingLine.trim();

    if (heading.toLowerCase() === category) {
      return `## ${heading}\n${bodyLines.join("\n").trim()}`.trim();
    }
  }

  return null;
}

export async function getTelegramHelpText(
  commandText: string,
  faqPath: string,
): Promise<string> {
  try {
    const faq = await readFile(faqPath, "utf8");
    const category = getHelpCategory(commandText);

    if (!category) {
      return faq.trim() || "Telegram bot help is empty.";
    }

    return (
      getSectionByHeading(faq, category) ??
      `No help category found for "${category}".`
    );
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return "Telegram bot help is not available yet.";
    }

    throw error;
  }
}
