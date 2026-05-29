type YapAnalysisSummary = {
  cleanedThought: string;
  hookIdeas: string[];
  suggestedAngle: string;
  title: string;
};

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

export function extractYapText(text: string): string {
  return text.replace(/^\/yap(?:@\w+)?(?:\s+|$)/i, "").trim();
}

export function formatYapSavedReply(analysis: YapAnalysisSummary): string {
  const hook = analysis.hookIdeas[0];
  const angle = analysis.suggestedAngle || analysis.cleanedThought;
  const parts = [`Saved to Yap Log: ${truncate(analysis.title, 80)}`];

  if (angle) {
    parts.push(`Angle: ${truncate(angle, 220)}`);
  }

  if (hook) {
    parts.push(`Hook: ${truncate(hook, 140)}`);
  }

  return parts.join("\n");
}
