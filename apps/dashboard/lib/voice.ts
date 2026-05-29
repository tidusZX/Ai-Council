/**
 * Caption sharpening via direct Anthropic call.
 *
 * The /api/voice/sharpen route requires a Supabase session so the bot
 * can't call it directly. We replicate the Ember sharpening here using
 * the same Anthropic API key — same model, same intent, no auth dance.
 */
import { limitTelegramText } from "@/lib/anthropic";

const EMBER_TELEGRAM_PROMPT = [
  "You are Ember, the voice sharpener for Shaq (@getarchivedsg), Singapore commercial photographer.",
  "Take the draft Instagram caption below and rewrite it to land harder.",
  "Use Shaq's voice: direct, observational, no hype words ('elevate', 'stunning', 'incredible').",
  "15-60 words. Punchy fragments allowed. End with 'DM SHOOT.' only if it's a sales post.",
  "Return ONLY the sharpened caption — no explanation, no preamble.",
].join(" ")

type SharpenCaptionInput = {
  apiBaseUrl: string;
  apiKey?: string;
  text: string;
};

export async function sharpenCaption({
  text,
}: SharpenCaptionInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ""
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set")

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 200,
      system: EMBER_TELEGRAM_PROMPT,
      messages: [{ role: "user", content: `Draft caption:\n\n${text}` }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Voice sharpen failed: ${response.status}`)
  }

  type Resp = { content?: { type: string; text: string }[] }
  const data = (await response.json()) as Resp
  const out = data.content?.find((b) => b.type === "text")?.text?.trim() ?? ""
  return limitTelegramText(out || "Couldn't sharpen that — try rephrasing.")
}
