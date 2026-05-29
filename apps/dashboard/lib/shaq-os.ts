export type ShaqOsPhotoAnalysis = {
  analysis: string;
  caption?: string;
  captions?: string[];
};

type AnalyzePhotoInput = {
  caption?: string;
  fileName: string;
  image: ArrayBuffer;
  mimeType: string;
};

type ShaqOsPhotoResponse = {
  analysis?: unknown;
  caption?: unknown;
  captions?: unknown;
  result?: unknown;
  summary?: unknown;
};

function getShaqOsImageAnalysisUrl(): string {
  const url = process.env.SHAQ_OS_IMAGE_ANALYSIS_URL ?? "";

  if (!url) {
    throw new Error("SHAQ_OS_IMAGE_ANALYSIS_URL is not configured");
  }

  return url;
}

function getShaqOsApiKey(): string | null {
  return process.env.SHAQ_OS_API_KEY || process.env.BOT_API_KEY || null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeShaqOsPhotoResponse(
  data: ShaqOsPhotoResponse,
): ShaqOsPhotoAnalysis {
  const analysis =
    stringValue(data.analysis) ??
    stringValue(data.summary) ??
    stringValue(data.result) ??
    "";

  return {
    analysis,
    caption: stringValue(data.caption),
    captions: stringArray(data.captions),
  };
}

export async function analyzePhotoWithShaqOs({
  caption,
  fileName,
  image,
  mimeType,
}: AnalyzePhotoInput): Promise<ShaqOsPhotoAnalysis> {
  const formData = new FormData();
  const headers: Record<string, string> = {};
  const apiKey = getShaqOsApiKey();

  formData.append("image", new Blob([image], { type: mimeType }), fileName);

  if (caption) {
    formData.append("caption", caption);
  }

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
    headers["x-bot-api-key"] = apiKey;
  }

  const response = await fetch(getShaqOsImageAnalysisUrl(), {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`SHAQ OS image analysis failed: ${response.status}`);
  }

  return normalizeShaqOsPhotoResponse(
    (await response.json()) as ShaqOsPhotoResponse,
  );
}
