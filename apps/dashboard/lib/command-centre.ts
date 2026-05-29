import {
  analyzeCommandCentreUpdate,
  type CommandCentreUpdate,
} from "@/lib/anthropic";
export {
  extractCommandCentreText,
  formatCommandCentreReply,
} from "@/lib/command-centre-format";

type SaveCommandCentreUpdateInput = {
  update: CommandCentreUpdate;
};

function getCommandCentreUpdateUrl(): string {
  const url = process.env.COMMAND_CENTRE_UPDATE_URL ?? "";

  if (!url) {
    throw new Error("COMMAND_CENTRE_UPDATE_URL is not configured");
  }

  return url;
}

function getCommandCentreApiKey(): string | null {
  return process.env.COMMAND_CENTRE_API_KEY || process.env.BOT_API_KEY || null;
}

export async function postCommandCentreUpdate({
  update,
}: SaveCommandCentreUpdateInput): Promise<void> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const apiKey = getCommandCentreApiKey();

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
    headers["x-bot-api-key"] = apiKey;
  }

  const response = await fetch(getCommandCentreUpdateUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...update,
      source: "telegram",
    }),
  });

  if (!response.ok) {
    throw new Error(`Command Centre update failed: ${response.status}`);
  }
}

export async function saveCommandCentreUpdate(
  rawUpdate: string,
): Promise<CommandCentreUpdate> {
  const update = await analyzeCommandCentreUpdate(rawUpdate);

  await postCommandCentreUpdate({ update });

  return update;
}
