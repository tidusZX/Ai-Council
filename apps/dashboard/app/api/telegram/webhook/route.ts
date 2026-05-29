import path from "node:path";

import { after, NextResponse } from "next/server";

import {
  processTelegramUpdate,
  type TelegramUpdate,
} from "@/lib/telegram-webhook";

export const runtime = "nodejs";

// FAQ lives inside the dashboard package so it's included in the build output
const FAQ_PATH = path.join(
  process.cwd(),
  "apps",
  "dashboard",
  "docs",
  "telegram-bot-faq.md",
);

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
    after(async () => {
      await result.followUp;
    });
  }

  return NextResponse.json({ ok: result.ok });
}
