import path from "node:path";

import { after, NextResponse } from "next/server";

import {
  processTelegramUpdate,
  type TelegramUpdate,
} from "@/lib/telegram-webhook";

export const runtime = "nodejs";

// In Vercel, process.cwd() is already apps/dashboard (the project root).
// Locally in the monorepo, cwd is the repo root so we need the full path.
// Try dashboard-relative first, fall back to monorepo-relative.
const FAQ_PATH = path.join(process.cwd(), "docs", "telegram-bot-faq.md");

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const update = (await request.json()) as TelegramUpdate;
  const result = await processTelegramUpdate(update, {
    apiBaseUrl: new URL(request.url).origin,
    faqPath: FAQ_PATH,
  });

  if (result.followUp) {
    const followUp = result.followUp
    after(async () => {
      await followUp()
    });
  }

  return NextResponse.json({ ok: result.ok });
}
